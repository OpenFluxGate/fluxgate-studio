package org.fluxgate.studio.admin.audit;

import com.mongodb.MongoException;
import com.mongodb.WriteConcern;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Aggregates;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.IndexOptions;
import com.mongodb.client.model.Indexes;
import com.mongodb.client.model.Sorts;
import com.mongodb.client.model.UpdateOptions;
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

  private static final Bson PAGE_ORDER = Sorts.descending("at", "_id");

  private final MongoCollection<Document> collection;
  private final MongoCollection<Document> menuPolicyCollection;
  private final Duration retention;

  public MongoAuditStore(
      MongoCollection<Document> collection,
      MongoCollection<Document> menuPolicyCollection,
      Duration retention) {
    this.collection = collection;
    this.menuPolicyCollection = menuPolicyCollection;
    this.retention = retention;
  }

  public void ensureIndexes() {
    ensureIndexes(audit());
    ensureIndexes(menuAudit());
  }

  private void ensureIndexes(MongoCollection<Document> source) {
    IndexOptions options = new IndexOptions();
    if (retention != null && retention.toSeconds() > 0) {
      options.expireAfter(retention.toSeconds(), TimeUnit.SECONDS);
    }
    source.createIndex(Indexes.ascending("at"), options);
    source.createIndex(PAGE_ORDER);
    source.createIndex(
        Indexes.compoundIndex(Indexes.ascending("action"), Indexes.descending("at")));
  }

  public void insert(AuditEntry entry) {
    MongoCollection<Document> source =
        entry.action() == AuditAction.MENU_POLICY_UPDATE ? menuAudit() : audit();
    source.insertOne(toDocument(entry));
  }

  /** Replays a menu change from the same atomic write that saved its policy. */
  public void insertPendingMenuAudit(Document entry) {
    Document fields = new Document(entry);
    ObjectId id = (ObjectId) fields.remove("_id");
    if (id == null) {
      throw new StorageConnectionException("MongoDB", "menu policy audit event ID is missing");
    }
    try {
      menuAudit()
          .withWriteConcern(WriteConcern.MAJORITY)
          .updateOne(
              Filters.eq("_id", id),
              new Document("$setOnInsert", fields),
              new UpdateOptions().upsert(true));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "menu policy audit append failed", e);
    }
  }

  public PageResponse<AuditEntry> search(AuditQuery query) {
    try {
      if (query.action() == AuditAction.MENU_POLICY_UPDATE) {
        return search(query, menuAudit(), filter(query, true), null, null);
      }
      if (query.action() != null) {
        return search(query, audit(), filter(query, false), null, null);
      }
      return search(query, audit(), filter(query, false), menuAudit(), filter(query, true));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "audit query failed", e);
    }
  }

  private static PageResponse<AuditEntry> search(
      AuditQuery query,
      MongoCollection<Document> primary,
      Bson primaryFilter,
      MongoCollection<Document> companion,
      Bson companionFilter) {
    long primaryCount = primary.countDocuments(primaryFilter);
    long companionCount = companion == null ? 0 : companion.countDocuments(companionFilter);
    long total = primaryCount + companionCount;
    long offset = (long) query.page() * query.size();
    if (offset >= total) {
      return new PageResponse<>(List.of(), query.page(), query.size(), total);
    }

    List<Bson> pipeline;
    if (primaryCount == 0) {
      primary = companion;
      pipeline = new ArrayList<>(ordered(companionFilter));
    } else if (companionCount == 0) {
      pipeline = new ArrayList<>(ordered(primaryFilter));
    } else {
      // An entry ranked after the end of this page within its own collection
      // cannot reach the page after the two sorted sources are combined.
      long limit = offset + query.size();
      pipeline = new ArrayList<>(pagePrefix(primaryFilter, limit));
      pipeline.add(
          Aggregates.unionWith(
              companion.getNamespace().getCollectionName(), pagePrefix(companionFilter, limit)));
      pipeline.add(Aggregates.sort(PAGE_ORDER));
    }
    if (offset > 0) {
      pipeline.add(new Document("$skip", offset));
    }
    pipeline.add(Aggregates.limit(query.size()));

    List<AuditEntry> content = new ArrayList<>();
    primary.aggregate(pipeline).allowDiskUse(true).map(MongoAuditStore::fromDocument).into(content);
    return new PageResponse<>(content, query.page(), query.size(), total);
  }

  private static List<Bson> ordered(Bson filter) {
    return List.of(Aggregates.match(filter), Aggregates.sort(PAGE_ORDER));
  }

  private static List<Bson> pagePrefix(Bson filter, long limit) {
    List<Bson> pipeline = new ArrayList<>(ordered(filter));
    pipeline.add(new Document("$limit", limit));
    return pipeline;
  }

  private static Bson filter(AuditQuery query, boolean menuPolicy) {
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
          menuPolicy
              ? Filters.regex("target.setting", pattern)
              : Filters.or(
                  Filters.regex("target.ruleSetId", pattern),
                  Filters.regex("target.ruleId", pattern)));
    }
    if (query.from() != null) {
      filters.add(Filters.gte("at", Date.from(query.from())));
    }
    if (query.to() != null) {
      filters.add(Filters.lt("at", Date.from(query.to())));
    }
    return filters.isEmpty() ? new Document() : Filters.and(filters);
  }

  public Optional<AuditEntry> findById(String id) {
    if (id == null || !ObjectId.isValid(id)) {
      return Optional.empty();
    }
    try {
      Bson filter = Filters.eq("_id", new ObjectId(id));
      Document doc = audit().find(filter).first();
      if (doc == null) {
        doc = menuAudit().find(filter).first();
      }
      return Optional.ofNullable(doc).map(MongoAuditStore::fromDocument);
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

  private MongoCollection<Document> menuAudit() {
    if (menuPolicyCollection == null) {
      throw new StorageConnectionException(
          "MongoDB", "the menu policy audit log needs the FluxGate Mongo connection");
    }
    return menuPolicyCollection;
  }

  public static Document toDocument(AuditEntry entry) {
    AuditActor actor = entry.actor();
    Document doc =
        new Document("at", Date.from(entry.at()))
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
    if (entry.id() != null) {
      doc.append("_id", new ObjectId(entry.id()));
    }
    return doc;
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
