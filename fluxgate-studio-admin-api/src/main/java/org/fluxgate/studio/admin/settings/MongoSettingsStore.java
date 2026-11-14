package org.fluxgate.studio.admin.settings;

import com.mongodb.MongoException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.ReplaceOptions;
import java.util.Optional;
import org.bson.Document;
import org.fluxgate.studio.admin.exception.StorageConnectionException;

/** Console wide settings, one document per setting. */
public class MongoSettingsStore {

  static final String BRANDING_ID = "branding";

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

  private MongoCollection<Document> settings() {
    if (collection == null) {
      throw new StorageConnectionException(
          "MongoDB", "console settings need the FluxGate Mongo connection");
    }
    return collection;
  }
}
