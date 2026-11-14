package org.fluxgate.studio.admin.audit;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.bson.types.ObjectId;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Stores who changed or looked up what. Entries are never updated. */
public class MongoAuditStore {

  private final MongoCollection<Document> collection;
  private final Duration retention;

  public MongoAuditStore(MongoCollection<Document> collection, Duration retention) {
    this.collection = collection;
    this.retention = retention;
  }

  public void ensureIndexes() {
    IndexOptions options = new IndexOptions();
    if (retention != null && retention.toSeconds() > 0) {
      options.expireAfter(retention.toSeconds(), TimeUnit.SECONDS);
    }
    audit().createIndex(Indexes.ascending("at"), options);
    audit()
        .createIndex(Indexes.compoundIndex(Indexes.ascending("action"), Indexes.descending("at")));
  }

  public void insert(AuditEntry entry) {
    audit().insertOne(toDocument(entry));
  }

  public PageResponse<AuditEntry> search(AuditQuery query) {
    List<Bson> filters = new ArrayList<>();
    if (query.action() != null) {
      filters.add(Filters.eq("action", query.action().name()));
    }
    if (query.actor() != null) {
      filters.add(Filters.eq("actor.username", query.actor()));
    }
    if (query.text() != null) {
      Pattern pattern = Pattern.compile(Pattern.quote(query.text()), Pattern.CASE_INSENSITIVE);
      filters.add(
          Filters.or(
              Filters.regex("target.ruleSetId", pattern), Filters.regex("target.ruleId", pattern)));
    }
    if (query.from() != null) {
      filters.add(Filters.gte("at", Date.from(query.from())));
    }
    if (query.to() != null) {
      filters.add(Filters.lt("at", Date.from(query.to())));
    }
    Bson filter = filters.isEmpty() ? new Document() : Filters.and(filters);
    try {
      long total = audit().countDocuments(filter);
      List<AuditEntry> content = new ArrayList<>();
      for (Document doc :
          audit()
              .find(filter)
              .sort(Sorts.descending("at"))
              .skip(query.page() * query.size())
              .limit(query.size())) {
        content.add(fromDocument(doc));
      }
      return new PageResponse<>(content, query.page(), query.size(), total);
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "audit query failed", e);
    }
  }

  public Optional<AuditEntry> findById(String id) {
    if (id == null || !ObjectId.isValid(id)) {
      return Optional.empty();
    }
    try {
      return Optional.ofNullable(audit().find(Filters.eq("_id", new ObjectId(id))).first())
          .map(MongoAuditStore::fromDocument);
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "audit query failed", e);
    }
  }

  private MongoCollection<Document> audit() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "the audit log needs the FluxGate Mongo connection");
    }
    return collection;
  }

  private static Document toDocument(AuditEntry entry) {
    AuditActor actor = entry.actor();
    return new Document("at", Date.from(entry.at()))
        .append(
            "actor",
            new Document("subject", actor.subject())
                .append("username", actor.username())
                .append("name", actor.name()))
        .append("action", entry.action().name())
        .append("target", document(entry.target()))
        .append("before", document(entry.before()))
        .append("after", document(entry.after()))
        .append("detail", document(entry.detail()));
  }

  private static AuditEntry fromDocument(Document doc) {
    Document actor = doc.get("actor", Document.class);
    return new AuditEntry(
        doc.getObjectId("_id").toHexString(),
        doc.getDate("at").toInstant(),
        new AuditActor(
            actor.getString("subject"), actor.getString("username"), actor.getString("name")),
        AuditAction.valueOf(doc.getString("action")),
        map(doc, "target"),
        map(doc, "before"),
        map(doc, "after"),
        map(doc, "detail"));
  }

  private static Document document(Map<String, Object> map) {
    return map == null ? null : new Document(map);
  }

  private static Map<String, Object> map(Document doc, String field) {
    Document value = doc.get(field, Document.class);
    return value == null ? null : new LinkedHashMap<>(value);
  }
}
