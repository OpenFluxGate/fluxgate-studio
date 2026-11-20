package org.fluxgate.studio.admin.settings;

import com.mongodb.ErrorCategory;
import com.mongodb.MongoException;
import com.mongodb.MongoWriteException;
import com.mongodb.ReadPreference;
import com.mongodb.WriteConcern;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;
import com.mongodb.client.model.Updates;
import java.util.Optional;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Console wide settings, one document per setting. */
public class MongoSettingsStore {

  static final String BRANDING_ID = "branding";
  static final String MENU_POLICY_ID = "menus";
  private static final String PENDING_AUDIT = "pendingAudit";

  private final MongoCollection<Document> collection;

  public MongoSettingsStore(MongoCollection<Document> collection) {
    this.collection = collection;
  }

  public Optional<Branding> branding() {
    try {
      Document doc = settings().find(Filters.eq("_id", BRANDING_ID)).first();
      if (doc == null) {
        return Optional.empty();
      }
      Object version = doc.get("version");
      return Optional.of(
          new Branding(
              doc.getString("logo"),
              doc.getString("favicon"),
              version instanceof Number number ? number.longValue() : null,
              doc.getString("updatedBy")));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "settings query failed", e);
    }
  }

  public void saveBranding(Branding branding) {
    Document doc =
        new Document("_id", BRANDING_ID)
            .append("logo", branding.logo())
            .append("favicon", branding.favicon())
            .append("version", branding.version())
            .append("updatedBy", branding.updatedBy());
    try {
      settings().replaceOne(Filters.eq("_id", BRANDING_ID), doc, new ReplaceOptions().upsert(true));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "settings update failed", e);
    }
  }

  StoredMenuPolicy menuPolicy() {
    try {
      Document doc = policySettings().find(Filters.eq("_id", MENU_POLICY_ID)).first();
      if (doc == null) {
        return new StoredMenuPolicy(MenuPolicy.DEFAULT, null);
      }
      Object version = doc.get("version");
      if (!(version instanceof Integer || version instanceof Long)
          || ((Number) version).longValue() < 1) {
        throw new IllegalArgumentException("Invalid stored menu policy version");
      }
      MenuPolicy policy =
          new MenuPolicy(
              ((Number) version).longValue(),
              doc.getList("admin", String.class),
              doc.getList("user", String.class));
      return new StoredMenuPolicy(policy, doc.get(PENDING_AUDIT, Document.class));
    } catch (MongoException | IllegalArgumentException | ClassCastException e) {
      throw new StorageConnectionException("MongoDB", "menu policy query failed", e);
    }
  }

  boolean saveMenuPolicy(MenuPolicy next, Document pendingAudit) {
    Document doc =
        new Document("_id", MENU_POLICY_ID)
            .append("version", next.version())
            .append("admin", next.admin())
            .append("user", next.user())
            .append(PENDING_AUDIT, pendingAudit);
    try {
      if (next.version() == 1) {
        policySettings().insertOne(doc);
        return true;
      }
      return policySettings().replaceOne(policyVersion(next.version() - 1), doc).getMatchedCount()
          == 1;
    } catch (MongoWriteException e) {
      if (next.version() == 1 && e.getError().getCategory() == ErrorCategory.DUPLICATE_KEY) {
        return false;
      }
      throw new StorageConnectionException("MongoDB", "menu policy update failed", e);
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "menu policy update failed", e);
    }
  }

  void clearPendingMenuAudit(long version) {
    try {
      policySettings().updateOne(policyVersion(version), Updates.unset(PENDING_AUDIT));
    } catch (MongoException e) {
      throw new StorageConnectionException("MongoDB", "menu policy audit cleanup failed", e);
    }
  }

  private static Bson policyVersion(long version) {
    return Filters.and(Filters.eq("_id", MENU_POLICY_ID), Filters.eq("version", version));
  }

  private MongoCollection<Document> policySettings() {
    return settings()
        .withReadPreference(ReadPreference.primary())
        .withWriteConcern(WriteConcern.MAJORITY);
  }

  record StoredMenuPolicy(MenuPolicy policy, Document pendingAudit) {}

  private MongoCollection<Document> settings() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "console settings need the FluxGate Mongo connection");
    }
    return collection;
  }
}
