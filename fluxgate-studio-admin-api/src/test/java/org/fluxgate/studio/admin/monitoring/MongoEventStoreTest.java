package org.fluxgate.studio.admin.monitoring;

import static java.util.stream.Collectors.toMap;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.tuple;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.mongodb.MongoException;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Map;
import java.util.function.Function;
import org.bson.Document;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoEventStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");

  /** Minute aligned start of every scenario. */
  private static final long T0 = 1_794_600_000_000L;

  private MongoClient client;
  private MongoCollection<Document> events;
  private MongoEventStore store;

  @BeforeEach
  void setUp() {
    client = MongoClients.create(MONGO.getReplicaSetUrl());
    events = client.getDatabase("studio_events").getCollection("rate_limit_events");
    events.drop();
    store = new MongoEventStore(events, Duration.ofSeconds(5));
  }

  @AfterEach
  void close() {
    client.close();
  }

  private void decision(long at, String ruleSetId, String key, boolean allowed) {
    Document doc =
        new Document("timestamp", at)
            .append("ruleSetId", ruleSetId)
            .append("ruleId", ruleSetId + "-rule")
            .append("allowed", allowed)
            .append("remainingTokens", allowed ? 3L : 0L)
            .append("retryAfterMs", allowed ? 0L : 2_000L)
            .append("endpoint", "/api/items")
            .append("method", "POST");
    if (key != null) {
      doc.append("userId", key);
    }
    events.insertOne(doc);
  }

  @Test
  void summarisesActivityPerRuleSetInsideTheWindow() {
    decision(T0 + 1_000, "a", "u1", true);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "b", "u2", true);
    decision(T0 - 1, "a", "u1", false);
    decision(T0 + 60_000, "a", "u1", false);

    Map<String, RuleSetActivity> byId =
        store.activityByRuleSet(T0, T0 + 60_000, null).stream()
            .collect(toMap(RuleSetActivity::ruleSetId, Function.identity()));

    assertThat(byId).containsOnlyKeys("a", "b");
    assertThat(byId.get("a")).isEqualTo(new RuleSetActivity("a", 2, 1, T0 + 2_000));
    assertThat(byId.get("b")).isEqualTo(new RuleSetActivity("b", 1, 0, T0 + 3_000));
  }

  @Test
  void narrowsActivityToOneKey() {
    decision(T0 + 1_000, "a", "u1", false);
    decision(T0 + 2_000, "a", "u2", true);

    assertThat(store.activityByRuleSet(T0, T0 + 60_000, "u1"))
        .containsExactly(new RuleSetActivity("a", 1, 1, T0 + 1_000));
  }

  @Test
  void groupsDecisionsIntoAlignedBuckets() {
    decision(T0 + 5_000, "a", "u1", true);
    decision(T0 + 65_000, "a", "u1", false);
    decision(T0 + 66_000, "b", "u1", false);

    assertThat(store.buckets(T0, T0 + 120_000, 60_000, null, null))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 2));
    assertThat(store.buckets(T0, T0 + 120_000, 60_000, "a", null))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 1));
    assertThat(store.buckets(T0, T0 + 120_000, 60_000, null, "u1")).hasSize(2);

    Map<String, java.util.List<Bucket>> perRuleSet =
        store.bucketsByRuleSet(T0, T0 + 120_000, 60_000);
    assertThat(perRuleSet).containsOnlyKeys("a", "b");
    assertThat(perRuleSet.get("a"))
        .containsExactly(new Bucket(T0, 1, 0), new Bucket(T0 + 60_000, 0, 1));
  }

  @Test
  void ranksRejectedKeysAndSkipsDecisionsWithoutKey() {
    decision(T0 + 1_000, "a", "u1", false);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "a", "u1", false);
    decision(T0 + 4_000, "a", "u2", false);
    decision(T0 + 5_000, "a", "u3", true);
    decision(T0 + 6_000, "a", null, false);

    assertThat(store.topRejected(T0, T0 + 60_000, null, 10))
        .extracting(RejectedKey::key, RejectedKey::rejected, RejectedKey::lastRejectedAt)
        .containsExactly(tuple("u1", 3L, T0 + 3_000), tuple("u2", 1L, T0 + 4_000));
    assertThat(store.topRejected(T0, T0 + 60_000, null, 1)).hasSize(1);
    assertThat(store.topRejected(T0, T0 + 60_000, "b", 10)).isEmpty();
  }

  @Test
  void returnsRecentAndLastDecisionsForOneKey() {
    decision(T0 + 1_000, "a", "u1", true);
    decision(T0 + 2_000, "a", "u1", false);
    decision(T0 + 3_000, "b", "u1", true);
    decision(T0 + 4_000, "a", "u2", false);

    assertThat(store.recentDecisions("u1", T0, T0 + 60_000, 2))
        .extracting(KeyDecision::timestamp)
        .containsExactly(T0 + 3_000, T0 + 2_000);

    Map<String, KeyDecision> last = store.lastDecisionByRuleSet("u1", T0, T0 + 60_000);
    assertThat(last).containsOnlyKeys("a", "b");
    assertThat(last.get("a"))
        .isEqualTo(
            new KeyDecision(T0 + 2_000, "a", "a-rule", "/api/items", "POST", false, 0, 2_000));
    assertThat(last.get("b").allowed()).isTrue();
  }

  @Test
  void createsTheQueryIndexes() {
    decision(T0, "a", "u1", true);
    store.ensureIndexes();

    assertThat(events.listIndexes().map(index -> index.getString("name")).into(new ArrayList<>()))
        .contains("timestamp_1", "ruleSetId_1_timestamp_1", "userId_1_timestamp_-1");
  }

  @Test
  void reportsAMissingCollectionAsUnavailable() {
    MongoEventStore disabled = new MongoEventStore(null, Duration.ofSeconds(1));
    assertThatThrownBy(() -> disabled.buckets(0, 1, 1, null, null))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  @SuppressWarnings("unchecked")
  void reportsDriverFailuresAsUnavailable() {
    MongoCollection<Document> broken = mock(MongoCollection.class);
    when(broken.aggregate(anyList())).thenThrow(new MongoException("boom"));
    MongoEventStore failing = new MongoEventStore(broken, Duration.ofSeconds(1));

    assertThatThrownBy(() -> failing.activityByRuleSet(0, 1, null))
        .isInstanceOf(StorageConnectionException.class);
  }
}
