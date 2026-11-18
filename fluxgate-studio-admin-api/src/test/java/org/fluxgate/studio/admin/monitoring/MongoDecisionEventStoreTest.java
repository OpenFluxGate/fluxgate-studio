package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Duration;
import java.util.List;
import org.bson.Document;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MongoDBContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers
class MongoDecisionEventStoreTest {
  @Container static final MongoDBContainer MONGO = new MongoDBContainer("mongo:7.0");

  @Test
  void keysetPagesTiesAndFiltersWithoutLeakingRawIdentity() throws Exception {
    try (MongoClient client = MongoClients.create(MONGO.getReplicaSetUrl())) {
      MongoCollection<Document> collection =
          client.getDatabase("events_test").getCollection("events");
      collection.drop();
      ObjectId first = new ObjectId("000000000000000000000001");
      ObjectId second = new ObjectId("000000000000000000000002");
      collection.insertMany(
          List.of(
              event(first, 100, false),
              event(second, 100, false),
              event(new ObjectId(), 101, true),
              event(new ObjectId(), 200, false),
              new Document("_id", "unsupported-legacy-id")
                  .append("timestamp", 100L)
                  .append("allowed", false)));
      collection.insertMany(
          List.of(
              new Document("timestamp", List.of(100L)).append("allowed", false),
              new Document("timestamp", 100L).append("allowed", List.of(false)),
              new Document("timestamp", 100.0).append("allowed", false),
              new Document("timestamp", 100L)));
      MongoDecisionEventStore store =
          new MongoDecisionEventStore(collection, Duration.ofSeconds(5));
      DecisionEventQuery query = new DecisionEventQuery(1, 200, "REJECT", 1, null);
      DecisionEventPage page = store.search(query);
      assertThat(page.items()).hasSize(1);
      assertThat(page.items().getFirst().id()).isEqualTo(second.toHexString());
      assertThat(page.items().getFirst().ruleId()).hasSize(256);
      assertThat(page.items().getFirst().remainingTokens()).isEqualTo(0L);
      assertThat(page.nextCursor()).isNotNull();
      DecisionEventPage next =
          store.search(new DecisionEventQuery(1, 200, "REJECT", 1, page.nextCursor()));
      assertThat(next.items())
          .extracting(DecisionEventPage.Item::id)
          .containsExactly(first.toHexString());
      assertThat(next.nextCursor()).isNull();
      assertThat(new ObjectMapper().writeValueAsString(page))
          .doesNotContain(
              "secret", "headers", "clientIp", "userId", "apiKey", "attributes", "endpoint");
      assertThat(collection.countDocuments()).isEqualTo(9);
      assertThat(store.search(new DecisionEventQuery(1, 200, "ALLOW", 100, null)).items())
          .hasSize(1);
      assertThat(store.search(new DecisionEventQuery(201, 300, null, 100, null)).items()).isEmpty();
    }
  }

  @Test
  void absentConnectionIsFailureNotEmptyData() {
    MongoDecisionEventStore store = new MongoDecisionEventStore(null, Duration.ofSeconds(5));
    assertThatThrownBy(() -> store.search(new DecisionEventQuery(1, 1000, null, 50, null)))
        .isInstanceOf(StorageConnectionException.class);
  }

  private static Document event(ObjectId id, long timestamp, boolean allowed) {
    return new Document("_id", id)
        .append("timestamp", timestamp)
        .append("allowed", allowed)
        .append("ruleSetId", "set")
        .append("ruleId", "x".repeat(300))
        .append("remainingTokens", 0L)
        .append("retryAfterMs", 2000L)
        .append("clientIp", "secret")
        .append("userId", "secret")
        .append("apiKey", "secret")
        .append("endpoint", "secret")
        .append("headers", new Document("Authorization", "secret"))
        .append("attributes", new Document("secret", "secret"));
  }
}
