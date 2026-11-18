package org.fluxgate.studio.admin.monitoring;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Aggregates;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.bson.BsonType;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Read-only recorder history. No counts, offset scans, index management or synthetic fallback. */
public class MongoDecisionEventStore {
  private final MongoCollection<Document> collection;
  private final long timeoutMillis;

  public MongoDecisionEventStore(MongoCollection<Document> collection, Duration timeout) {
    this.collection = collection;
    this.timeoutMillis = Math.max(1, Math.min(5000, timeout.toMillis()));
  }

  public DecisionEventPage search(DecisionEventQuery query) {
    List<Bson> pipeline = pipeline(query);
    if (collection == null)
      throw new StorageConnectionException(
          "MongoDB", "event history needs the FluxGate Mongo connection");
    try {
      List<Document> documents =
          collection
              .aggregate(pipeline)
              .allowDiskUse(false)
              .maxTime(timeoutMillis, TimeUnit.MILLISECONDS)
              .into(new ArrayList<>());
      boolean more = documents.size() > query.limit();
      List<DecisionEventPage.Item> items = new ArrayList<>();
      for (Document document : documents.subList(0, Math.min(documents.size(), query.limit()))) {
        items.add(
            new DecisionEventPage.Item(
                document.getObjectId("_id").toHexString(),
                ((Number) document.get("timestamp")).longValue(),
                document.getString("ruleSetId"),
                document.getString("ruleId"),
                document.getBoolean("allowed"),
                number(document, "remainingTokens"),
                number(document, "retryAfterMs")));
      }
      Document last = more ? documents.get(query.limit() - 1) : null;
      return new DecisionEventPage(
          List.copyOf(items),
          last == null
              ? null
              : query.after(((Number) last.get("timestamp")).longValue(), last.getObjectId("_id")));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "event history query failed", e);
    }
  }

  static List<Bson> pipeline(DecisionEventQuery query) {
    List<Bson> filters = new ArrayList<>();
    filters.add(Filters.gte("timestamp", query.from()));
    filters.add(Filters.lt("timestamp", query.to()));
    filters.add(
        Filters.expr(
            new Document(
                "$in", List.of(new Document("$type", "$timestamp"), List.of("long", "int")))));
    filters.add(Filters.type("_id", BsonType.OBJECT_ID));
    filters.add(
        Filters.expr(new Document("$eq", List.of(new Document("$type", "$allowed"), "bool"))));
    if (query.outcome() != null)
      filters.add(Filters.eq("allowed", query.outcome().equals("ALLOW")));
    DecisionEventQuery.Position position = query.position();
    if (position != null) {
      // Give the index scan a timestamp bound even when Mongo evaluates the tie-break OR at FETCH.
      filters.add(Filters.lte("timestamp", position.timestamp()));
      filters.add(
          Filters.or(
              Filters.lt("timestamp", position.timestamp()),
              Filters.and(
                  Filters.eq("timestamp", position.timestamp()),
                  Filters.lt("_id", position.id()))));
    }
    Document projection =
        new Document("_id", 1)
            .append("timestamp", 1)
            .append("allowed", 1)
            .append("ruleSetId", boundedString("ruleSetId"))
            .append("ruleId", boundedString("ruleId"))
            .append("remainingTokens", integerOrNull("remainingTokens"))
            .append("retryAfterMs", integerOrNull("retryAfterMs"));
    return List.of(
        Aggregates.match(Filters.and(filters)),
        Aggregates.sort(Sorts.descending("timestamp", "_id")),
        Aggregates.limit(query.limit() + 1),
        Aggregates.project(projection));
  }

  private static Document boundedString(String field) {
    return new Document(
        "$cond",
        List.of(
            new Document("$eq", List.of(new Document("$type", "$" + field), "string")),
            new Document("$substrCP", List.of("$" + field, 0, 256)),
            new Document("$literal", null)));
  }

  private static Document integerOrNull(String field) {
    return new Document(
        "$cond",
        List.of(
            new Document(
                "$in", List.of(new Document("$type", "$" + field), List.of("int", "long"))),
            "$" + field,
            new Document("$literal", null)));
  }

  private static Long number(Document document, String field) {
    return document.get(field) instanceof Number value ? value.longValue() : null;
  }
}
