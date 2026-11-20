package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoAuditStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");
  private static final Instant T0 = Instant.parse("2026-11-14T00:00:00Z");

  private MongoClient client;
  private MongoCollection<Document> collection;
  private MongoCollection<Document> menuPolicyCollection;
  private MongoAuditStore store;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    collection = client.getDatabase("studio_audit").getCollection("studio_audit_log");
    menuPolicyCollection =
        client.getDatabase("studio_audit").getCollection("studio_audit_log_menu_policy");
    collection.drop();
    menuPolicyCollection.drop();
    store = new MongoAuditStore(collection, menuPolicyCollection, Duration.ofDays(730));
  }

  @AfterEach
  void close() {
    client.close();
  }

  private static Map<String, Object> map(Object... pairs) {
    Map<String, Object> map = new LinkedHashMap<>();
    for (int i = 0; i < pairs.length; i += 2) {
      map.put((String) pairs[i], pairs[i + 1]);
    }
    return map;
  }

  private void entry(Instant at, String user, AuditAction action, String ruleId) {
    store.insert(
        new AuditEntry(
            null,
            at,
            new AuditActor("sub-" + user, user, user.toUpperCase()),
            action,
            ruleId == null ? null : map("ruleSetId", "checkout", "ruleId", ruleId),
            map("enabled", true),
            map("enabled", false),
            null));
  }

  @Test
  void storesAndReadsBackAnEntry() {
    entry(T0, "alice", AuditAction.RULE_TOGGLE, "checkout-per-user");

    PageResponse<AuditEntry> page =
        store.search(new AuditQuery(null, null, null, null, null, 0, 10));

    assertThat(page.totalElements()).isEqualTo(1);
    AuditEntry stored = page.content().get(0);
    assertThat(stored.id()).isNotBlank();
    assertThat(stored.at()).isEqualTo(T0);
    assertThat(stored.actor()).isEqualTo(new AuditActor("sub-alice", "alice", "ALICE"));
    assertThat(stored.action()).isEqualTo(AuditAction.RULE_TOGGLE);
    assertThat(stored.target()).containsEntry("ruleId", "checkout-per-user");
    assertThat(stored.after()).containsEntry("enabled", false);
    assertThat(store.findById(stored.id())).contains(stored);
  }

  @Test
  void filtersAndPagesNewestFirst() {
    entry(T0, "alice", AuditAction.RULE_UPDATE, "checkout-per-user");
    entry(T0.plusSeconds(1), "bob", AuditAction.RULE_UPDATE, "login-per-ip");
    entry(T0.plusSeconds(2), "alice", AuditAction.KEY_LOOKUP, null);

    assertThat(store.search(new AuditQuery(null, null, null, null, null, 0, 2)).content())
        .extracting(entry -> entry.actor().username())
        .containsExactly("alice", "bob");
    assertThat(
            store
                .search(new AuditQuery(AuditAction.RULE_UPDATE, "alice", null, null, null, 0, 10))
                .totalElements())
        .isEqualTo(1);
    assertThat(
            store
                .search(new AuditQuery(null, null, "LOGIN", null, null, 0, 10))
                .content()
                .get(0)
                .target())
        .containsEntry("ruleId", "login-per-ip");
    assertThat(
            store
                .search(
                    new AuditQuery(null, null, null, T0.plusSeconds(1), T0.plusSeconds(2), 0, 10))
                .totalElements())
        .isEqualTo(1);
  }

  @Test
  void ignoresMalformedIds() {
    assertThat(store.findById("not-an-object-id")).isEmpty();
  }

  @Test
  void createsTheRetentionIndex() {
    store.ensureIndexes();

    for (MongoCollection<Document> source : List.of(collection, menuPolicyCollection)) {
      List<Document> indexes = source.listIndexes().into(new ArrayList<>());
      Document ttl =
          indexes.stream()
              .filter(index -> "at_1".equals(index.getString("name")))
              .findFirst()
              .orElseThrow();
      assertThat(ttl.get("expireAfterSeconds", Number.class).longValue())
          .isEqualTo(Duration.ofDays(730).toSeconds());
      assertThat(indexes)
          .anySatisfy(
              index ->
                  assertThat(index.get("key", Document.class))
                      .isEqualTo(new Document("at", -1).append("_id", -1)));
    }
  }

  @Test
  void skipsTheTtlWhenRetentionIsZero() {
    new MongoAuditStore(collection, menuPolicyCollection, Duration.ZERO).ensureIndexes();

    for (MongoCollection<Document> source : List.of(collection, menuPolicyCollection)) {
      Document index =
          source.listIndexes().into(new ArrayList<>()).stream()
              .filter(candidate -> "at_1".equals(candidate.getString("name")))
              .findFirst()
              .orElseThrow();
      assertThat(index.containsKey("expireAfterSeconds")).isFalse();
    }
  }

  @Test
  void reportsAMissingCollectionAsUnavailable() {
    MongoAuditStore disabled = new MongoAuditStore(null, null, Duration.ZERO);
    assertThatThrownBy(() -> disabled.search(new AuditQuery(null, null, null, null, null, 0, 1)))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  void keepsMenuAuditInvisibleToRollbackReadersAndCombinesBothSourcesForCurrentReaders() {
    entry(T0, "alice", AuditAction.RULE_UPDATE, "checkout-first");
    entry(T0.plusSeconds(2), "bob", AuditAction.RULE_UPDATE, "checkout-last");
    String menuId = new ObjectId().toHexString();
    Document pending =
        MongoAuditStore.toDocument(
            new AuditEntry(
                menuId,
                T0.plusSeconds(1),
                new AuditActor("sub-alice", "alice", "ALICE"),
                AuditAction.MENU_POLICY_UPDATE,
                Map.of("setting", "menus"),
                Map.of("version", 0L),
                Map.of("version", 1L),
                null));
    store.insertPendingMenuAudit(pending);
    store.insertPendingMenuAudit(pending);

    // A rollback reader queries the original collection and decodes an enum without
    // MENU_POLICY_UPDATE.
    List<LegacyAction> legacyActions =
        collection
            .find()
            .sort(Sorts.descending("at"))
            .map(row -> LegacyAction.valueOf(row.getString("action")))
            .into(new ArrayList<>());
    assertThat(legacyActions).containsExactly(LegacyAction.RULE_UPDATE, LegacyAction.RULE_UPDATE);
    assertThat(menuPolicyCollection.countDocuments()).isEqualTo(1);

    var page = store.search(new AuditQuery(null, null, null, null, null, 0, 2));
    assertThat(page.totalElements()).isEqualTo(3);
    assertThat(page.content())
        .extracting(AuditEntry::action)
        .containsExactly(AuditAction.RULE_UPDATE, AuditAction.MENU_POLICY_UPDATE);
    assertThat(page.content().getFirst().actor().username()).isEqualTo("bob");
    assertThat(store.search(new AuditQuery(null, null, null, null, null, 1, 2)).content())
        .extracting(AuditEntry::at)
        .containsExactly(T0);
    assertThat(
            store
                .search(new AuditQuery(null, null, null, null, null, Integer.MAX_VALUE, 2))
                .content())
        .isEmpty();
    assertThat(store.findById(menuId)).contains(page.content().getLast());
    assertThat(store.findById(new ObjectId().toHexString())).isEmpty();
    assertThat(
            store
                .search(new AuditQuery(AuditAction.RULE_UPDATE, null, null, null, null, 0, 10))
                .totalElements())
        .isEqualTo(2);
    assertThat(
            store
                .search(
                    new AuditQuery(
                        AuditAction.MENU_POLICY_UPDATE,
                        "alice",
                        "MENUS",
                        T0.plusSeconds(1),
                        T0.plusSeconds(2),
                        0,
                        10))
                .content())
        .containsExactly(page.content().getLast());
    assertThat(store.search(new AuditQuery(null, "alice", null, null, null, 0, 10)).content())
        .extracting(AuditEntry::at)
        .containsExactly(T0.plusSeconds(1), T0);
  }

  @Test
  void tieBreaksAcrossCollectionsAndSearchesWhenLegacyCollectionDoesNotExist() {
    String menuId = new ObjectId("000000000000000000000001").toHexString();
    store.insertPendingMenuAudit(
        MongoAuditStore.toDocument(
            new AuditEntry(
                menuId,
                T0,
                new AuditActor("sub-alice", "alice", "ALICE"),
                AuditAction.MENU_POLICY_UPDATE,
                Map.of("setting", "menus"),
                null,
                null,
                null)));
    assertThat(store.search(new AuditQuery(null, null, null, null, null, 0, 1)).content())
        .extracting(AuditEntry::id)
        .containsExactly(menuId);
    entry(T0, "alice", AuditAction.RULE_UPDATE, "r1");

    assertThat(store.search(new AuditQuery(null, null, null, null, null, 0, 1)).content())
        .extracting(AuditEntry::action)
        .containsExactly(AuditAction.RULE_UPDATE);
    assertThat(store.search(new AuditQuery(null, null, null, null, null, 1, 1)).content())
        .extracting(AuditEntry::id)
        .containsExactly(menuId);
  }

  private enum LegacyAction {
    RULE_UPDATE
  }
}
