package org.fluxgate.studio.admin.monitoring;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Accumulators;
import com.mongodb.client.model.Aggregates;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Reads the rate limit decisions services record. Studio never writes to this collection. */
public class MongoEventStore {

  private static final String TIMESTAMP = "timestamp";
  private static final String FIELD_TIMESTAMP = "$" + TIMESTAMP;
  private static final Document ALLOWED = countWhen(true);
  private static final Document REJECTED = countWhen(false);

  private final MongoCollection<Document> collection;
  private final long maxTimeMillis;

  public MongoEventStore(MongoCollection<Document> collection, Duration queryTimeout) {
    this.collection = collection;
    this.maxTimeMillis = queryTimeout.toMillis();
  }

  public void ensureIndexes() {
    MongoCollection<Document> events = events();
    events.createIndex(Indexes.ascending(TIMESTAMP));
    events.createIndex(
        Indexes.compoundIndex(Indexes.ascending("ruleSetId"), Indexes.ascending(TIMESTAMP)));
    events.createIndex(
        Indexes.compoundIndex(Indexes.ascending("userId"), Indexes.descending(TIMESTAMP)));
  }

  public List<RuleSetActivity> activityByRuleSet(long from, long to, String key) {
    List<RuleSetActivity> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, null, key)),
                Aggregates.group(
                    "$ruleSetId",
                    Accumulators.sum("total", 1),
                    Accumulators.sum("rejected", REJECTED),
                    Accumulators.max("lastAt", FIELD_TIMESTAMP))))) {
      result.add(
          new RuleSetActivity(
              doc.getString("_id"),
              number(doc, "total"),
              number(doc, "rejected"),
              number(doc, "lastAt")));
    }
    return result;
  }

  public List<Bucket> buckets(long from, long to, long bucketMillis, String ruleSetId, String key) {
    List<Bucket> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, ruleSetId, key)),
                Aggregates.group(
                    bucketStart(bucketMillis),
                    Accumulators.sum("allowed", ALLOWED),
                    Accumulators.sum("rejected", REJECTED)),
                Aggregates.sort(Sorts.ascending("_id"))))) {
      result.add(new Bucket(number(doc, "_id"), number(doc, "allowed"), number(doc, "rejected")));
    }
    return result;
  }

  public Map<String, List<Bucket>> bucketsByRuleSet(long from, long to, long bucketMillis) {
    Map<String, List<Bucket>> result = new LinkedHashMap<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(
                    Filters.and(range(from, to, null, null), Filters.ne("ruleSetId", null))),
                Aggregates.group(
                    new Document("ruleSetId", "$ruleSetId")
                        .append("start", bucketStart(bucketMillis)),
                    Accumulators.sum("allowed", ALLOWED),
                    Accumulators.sum("rejected", REJECTED)),
                Aggregates.sort(Sorts.ascending("_id.start"))))) {
      Document id = doc.get("_id", Document.class);
      result
          .computeIfAbsent(id.getString("ruleSetId"), ignored -> new ArrayList<>())
          .add(new Bucket(number(id, "start"), number(doc, "allowed"), number(doc, "rejected")));
    }
    return result;
  }

  public List<RejectedKey> topRejected(long from, long to, String ruleSetId, int limit) {
    List<RejectedKey> result = new ArrayList<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(
                    Filters.and(
                        range(from, to, ruleSetId, null),
                        Filters.eq("allowed", false),
                        Filters.nin("userId", null, ""))),
                Aggregates.group(
                    new Document("ruleSetId", "$ruleSetId").append("key", "$userId"),
                    Accumulators.sum("rejected", 1),
                    Accumulators.max("lastAt", FIELD_TIMESTAMP)),
                Aggregates.sort(
                    Sorts.orderBy(Sorts.descending("rejected"), Sorts.descending("lastAt"))),
                Aggregates.limit(limit)))) {
      Document id = doc.get("_id", Document.class);
      result.add(
          new RejectedKey(
              id.getString("ruleSetId"),
              id.getString("key"),
              number(doc, "rejected"),
              number(doc, "lastAt")));
    }
    return result;
  }

  public List<KeyDecision> recentDecisions(String key, long from, long to, int limit) {
    try {
      List<KeyDecision> result = new ArrayList<>();
      for (Document doc :
          events()
              .find(range(from, to, null, key))
              .sort(Sorts.descending(TIMESTAMP))
              .limit(limit)
              .maxTime(maxTimeMillis, TimeUnit.MILLISECONDS)) {
        result.add(decision(doc));
      }
      return result;
    } catch (MongoException e) {
      throw unavailable(e);
    }
  }

  public Map<String, KeyDecision> lastDecisionByRuleSet(String key, long from, long to) {
    Map<String, KeyDecision> result = new LinkedHashMap<>();
    for (Document doc :
        aggregate(
            List.of(
                Aggregates.match(range(from, to, null, key)),
                Aggregates.sort(Sorts.descending(TIMESTAMP)),
                Aggregates.group("$ruleSetId", Accumulators.first("last", "$$ROOT"))))) {
      result.put(doc.getString("_id"), decision(doc.get("last", Document.class)));
    }
    return result;
  }

  private static Bson range(long from, long to, String ruleSetId, String key) {
    List<Bson> filters = new ArrayList<>();
    filters.add(Filters.gte(TIMESTAMP, from));
    filters.add(Filters.lt(TIMESTAMP, to));
    if (ruleSetId != null) {
      filters.add(Filters.eq("ruleSetId", ruleSetId));
    }
    if (key != null) {
      filters.add(Filters.eq("userId", key));
    }
    return Filters.and(filters);
  }

  private static Document bucketStart(long bucketMillis) {
    return new Document(
        "$subtract",
        List.of(FIELD_TIMESTAMP, new Document("$mod", List.of(FIELD_TIMESTAMP, bucketMillis))));
  }

  private static Document countWhen(boolean allowed) {
    return new Document("$cond", List.of(new Document("$eq", List.of("$allowed", allowed)), 1, 0));
  }

  private List<Document> aggregate(List<Bson> pipeline) {
    try {
      return events()
          .aggregate(pipeline)
          .maxTime(maxTimeMillis, TimeUnit.MILLISECONDS)
          .into(new ArrayList<>());
    } catch (MongoException e) {
      throw unavailable(e);
    }
  }

  private MongoCollection<Document> events() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "event history needs the FluxGate Mongo connection");
    }
    return collection;
  }

  private static StorageConnectionException unavailable(MongoException e) {
    return new StorageConnectionException("MongoDB", "event query failed", e);
  }

  private static KeyDecision decision(Document doc) {
    return new KeyDecision(
        number(doc, TIMESTAMP),
        doc.getString("ruleSetId"),
        doc.getString("ruleId"),
        doc.getString("endpoint"),
        doc.getString("method"),
        Boolean.TRUE.equals(doc.getBoolean("allowed")),
        number(doc, "remainingTokens"),
        number(doc, "retryAfterMs"));
  }

  private static long number(Document doc, String field) {
    return doc.get(field) instanceof Number value ? value.longValue() : 0L;
  }
}
