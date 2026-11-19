package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;
import com.mongodb.client.MongoCollection;
import java.time.Duration;
import java.util.List;
import org.bson.Document;
import org.bson.types.Decimal128;
import org.bson.types.ObjectId;
import org.fluxgate.adapter.mongo.event.MongoRateLimitMetricsRecorder;
import org.fluxgate.core.context.RequestContext;
import org.fluxgate.core.key.RateLimitKey;
import org.fluxgate.core.ratelimiter.RateLimitResult;
import org.fluxgate.studio.admin.controller.DecisionEventController;
import org.fluxgate.studio.admin.exception.GlobalExceptionHandler;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
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
  void recorderWritesDecisionsReadThroughTheHttpContract() throws Exception {
    try (MongoClient client = MongoClients.create(MONGO.getReplicaSetUrl())) {
      MongoCollection<Document> events =
          client.getDatabase("writer_contract").getCollection("rate_limit_events");
      RequestContext request =
          RequestContext.builder().userId("fixture-user").endpoint("/fixture").build();
      RateLimitKey key = RateLimitKey.of("fixture");
      long from = System.currentTimeMillis() - 1000;
      try (MongoRateLimitMetricsRecorder recorder = new MongoRateLimitMetricsRecorder(events)) {
        recorder.record(
            request, RateLimitResult.builder(key).allowed(true).remainingTokens(4).build());
        recorder.record(
            request,
            RateLimitResult.builder(key)
                .allowed(false)
                .remainingTokens(0)
                .nanosToWaitForRefill(250_000_000)
                .build());
        assertThat(recorder.flush(Duration.ofSeconds(5))).isTrue();
        assertThat(recorder.getWrittenEvents()).isEqualTo(2);
        assertThat(recorder.getDroppedEvents()).isZero();
        assertThat(recorder.getFailedEvents()).isZero();
      }
      long to = System.currentTimeMillis() + 1;
      assertThat(events.countDocuments()).isEqualTo(2);
      MockMvc api = api(events);
      api.perform(
              get("/api/events")
                  .param("from", Long.toString(from))
                  .param("to", Long.toString(to))
                  .param("outcome", "ALLOW"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items.length()").value(1))
          .andExpect(jsonPath("$.items[0].remainingTokens").value(4))
          .andExpect(jsonPath("$.items[0].userId").doesNotExist());
      api.perform(
              get("/api/events")
                  .param("from", Long.toString(from))
                  .param("to", Long.toString(to))
                  .param("outcome", "REJECT"))
          .andExpect(status().isOk())
          .andExpect(jsonPath("$.items.length()").value(1))
          .andExpect(jsonPath("$.items[0].allowed").value(false))
          .andExpect(jsonPath("$.items[0].retryAfterMillis").value(250))
          .andExpect(jsonPath("$.items[0].endpoint").doesNotExist());
    }
  }

  @Test
  void optionalWriterCountersExcludeNonIntegerBsonTypes() {
    try (MongoClient client = MongoClients.create(MONGO.getReplicaSetUrl())) {
      MongoCollection<Document> events =
          client.getDatabase("imported_events").getCollection("events");
      events.insertOne(
          new Document("timestamp", 100L)
              .append("allowed", true)
              .append("remainingTokens", Double.NaN)
              .append("retryAfterMs", Decimal128.parse("1E+30")));
      var store = new MongoDecisionEventStore(events, Duration.ofSeconds(5));
      var item = store.search(new DecisionEventQuery(1, 200, null, 10, null)).items().getFirst();
      assertThat(item.remainingTokens()).isNull();
      assertThat(item.retryAfterMillis()).isNull();
    }
  }

  @Test
  void unavailableMongoReturnsServiceUnavailable() throws Exception {
    // Reserve a loopback port without listening, so another process cannot take this endpoint.
    try (var port = new java.net.Socket()) {
      port.bind(new java.net.InetSocketAddress(java.net.InetAddress.getByName("127.0.0.1"), 0));
      try (MongoClient client =
          MongoClients.create(
              "mongodb://127.0.0.1:" + port.getLocalPort() + "/?serverSelectionTimeoutMS=4500")) {
        var events = client.getDatabase("events").getCollection("events");
        var mvc =
            MockMvcBuilders.standaloneSetup(
                    new DecisionEventController(
                        new MongoDecisionEventStore(events, Duration.ofMillis(200))))
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        long start = System.nanoTime();
        mvc.perform(get("/api/events?from=1&to=1000")).andExpect(status().isServiceUnavailable());
        assertThat(Duration.ofNanos(System.nanoTime() - start)).isLessThan(Duration.ofSeconds(2));
      }
    }
  }

  private static MockMvc api(MongoCollection<Document> events) {
    return MockMvcBuilders.standaloneSetup(
            new DecisionEventController(new MongoDecisionEventStore(events, Duration.ofSeconds(5))))
        .setControllerAdvice(new GlobalExceptionHandler())
        .build();
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
