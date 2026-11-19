package org.fluxgate.studio.admin.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.bson.Document;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditQuery;
import org.fluxgate.studio.admin.audit.MongoAuditStore;
import org.fluxgate.studio.admin.exception.MenuPolicyException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoSettingsStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");

  private MongoClient client;
  private MongoSettingsStore store;
  private MongoCollection<Document> collection;
  private MongoCollection<Document> auditCollection;
  private MongoCollection<Document> menuAuditCollection;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    collection = client.getDatabase("studio_settings").getCollection("studio_settings");
    auditCollection = client.getDatabase("studio_settings").getCollection("studio_audit");
    menuAuditCollection =
        client.getDatabase("studio_settings").getCollection("studio_audit_menu_policy");
    collection.drop();
    auditCollection.drop();
    menuAuditCollection.drop();
    store = new MongoSettingsStore(collection);
  }

  @AfterEach
  void close() {
    client.close();
  }

  @Test
  void isEmptyUntilSomethingIsSaved() {
    assertThat(store.branding()).isEmpty();
  }

  @Test
  void savesAndReplacesTheBranding() {
    store.saveBranding(new Branding("data:image/png;base64,AA==", null, 10L, "alice"));
    store.saveBranding(new Branding(null, "data:image/png;base64,AQ==", 20L, "bob"));

    assertThat(store.branding())
        .contains(new Branding(null, "data:image/png;base64,AQ==", 20L, "bob"));
  }

  @Test
  void failsClearlyWithoutAMongoConnection() {
    MongoSettingsStore unavailable = new MongoSettingsStore(null);

    assertThatThrownBy(unavailable::branding).isInstanceOf(StorageConnectionException.class);
    assertThatThrownBy(() -> unavailable.saveBranding(Branding.DEFAULT))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  void savesRawPolicyAndItsPendingAuditTogetherAndRetrievesTheAuditAfterRecovery() {
    Clock clock = Clock.fixed(Instant.parse("2026-11-19T03:00:00Z"), ZoneOffset.UTC);
    MenuPolicyService service =
        new MenuPolicyService(
            store, new MongoAuditStore(auditCollection, null, Duration.ZERO), clock);
    var admin = new UsernamePasswordAuthenticationToken("operator", null);
    MenuPolicy request = new MenuPolicy(0, List.of("settings", "audit"), List.of("rules"));
    MenuPolicy expected = new MenuPolicy(1, List.of("audit", "settings"), List.of("rules"));

    assertThat(service.current()).isEqualTo(MenuPolicy.DEFAULT);
    assertThat(service.update(admin, request))
        .isEqualTo(new MenuPolicyService.Saved(expected, false));
    MongoSettingsStore.StoredMenuPolicy pending = store.menuPolicy();
    assertThat(pending.policy()).isEqualTo(expected);
    assertThat(pending.pendingAudit().getObjectId("_id")).isNotNull();
    assertThatThrownBy(() -> service.update(admin, request))
        .isInstanceOfSatisfying(
            MenuPolicyException.class,
            ex -> assertThat(ex.status()).isEqualTo(HttpStatus.CONFLICT));
    assertThatThrownBy(
            () ->
                service.update(admin, new MenuPolicy(1, List.of("settings"), List.of("overview"))))
        .isInstanceOf(StorageConnectionException.class);
    assertThat(store.menuPolicy()).isEqualTo(pending);

    MongoAuditStore audit =
        new MongoAuditStore(auditCollection, menuAuditCollection, Duration.ZERO);
    // Simulate an interruption after publishing but before clearing the pending event.
    audit.insertPendingMenuAudit(pending.pendingAudit());
    MenuPolicyService recovered = new MenuPolicyService(store, audit, clock);
    assertThat(recovered.current()).isEqualTo(expected);
    assertThat(store.menuPolicy().pendingAudit()).isNull();
    assertThat(auditCollection.countDocuments()).isZero();
    assertThat(menuAuditCollection.countDocuments()).isEqualTo(1);
    var entry =
        audit
            .search(
                new AuditQuery(AuditAction.MENU_POLICY_UPDATE, "operator", null, null, null, 0, 10))
            .content()
            .getFirst();
    assertThat(entry.id()).isEqualTo(pending.pendingAudit().getObjectId("_id").toHexString());
    assertThat(entry.actor().username()).isEqualTo("operator");
    assertThat(entry.before()).containsEntry("version", 0L);
    assertThat(entry.after()).containsEntry("version", 1L).containsEntry("admin", expected.admin());

    // An identical policy submitted with different list order is a no-op.
    var reordered = new MenuPolicy(1, List.of("settings", "audit"), List.of("rules"));
    assertThat(recovered.update(admin, reordered))
        .isEqualTo(new MenuPolicyService.Saved(expected, true));
    assertThat(auditCollection.countDocuments()).isZero();
    assertThat(menuAuditCollection.countDocuments()).isEqualTo(1);
  }

  @Test
  void comparesStoredVersionAtTheWriteAndIgnoresStaleAuditCleanup() {
    Document firstAudit = new Document("test", "first");
    Document secondAudit = new Document("test", "second");
    MenuPolicy first = new MenuPolicy(1, List.of("settings"), List.of("rules"));
    MenuPolicy second = new MenuPolicy(2, List.of("settings"), List.of("overview"));

    assertThat(store.saveMenuPolicy(first, firstAudit)).isTrue();
    assertThat(store.saveMenuPolicy(first, firstAudit)).isFalse();
    assertThat(store.saveMenuPolicy(second, secondAudit)).isTrue();
    assertThat(store.saveMenuPolicy(second, secondAudit)).isFalse();
    store.clearPendingMenuAudit(1);

    assertThat(store.menuPolicy())
        .isEqualTo(new MongoSettingsStore.StoredMenuPolicy(second, secondAudit));
  }

  @Test
  void distinguishesInvalidStoredPolicyFromMissingPolicy() {
    assertThat(store.menuPolicy().policy()).isEqualTo(MenuPolicy.DEFAULT);
    collection.insertOne(
        new Document("_id", MongoSettingsStore.MENU_POLICY_ID)
            .append("version", 1L)
            .append("admin", List.of("audit"))
            .append("user", List.of("rules")));
    assertThatThrownBy(store::menuPolicy).isInstanceOf(StorageConnectionException.class);
    assertThatThrownBy(new MongoSettingsStore(null)::menuPolicy)
        .isInstanceOf(StorageConnectionException.class);
  }
}
