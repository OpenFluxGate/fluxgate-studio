import com.mongodb.client.*;
import com.mongodb.client.model.Filters;
import java.time.Duration;
import java.util.*;
import org.bson.Document;
import org.fluxgate.adapter.mongo.repository.MongoRateLimitRuleRepository;
import org.fluxgate.core.config.*;

public class CompatProbe {
  static RateLimitRule rule(String set, String id, long cap) {
    return RateLimitRule.builder(id)
        .name(id)
        .scope(LimitScope.PER_USER)
        .keyStrategyId("userId")
        .ruleSetId(set)
        .addBand(RateLimitBand.builder(Duration.ofMinutes(1), cap).build())
        .build();
  }

  static void check(boolean b, String msg) {
    if (!b) throw new AssertionError(msg);
    System.out.println("PASS " + msg);
  }

  public static void main(String[] args) throws Exception {
    if (args.length != 1) throw new IllegalArgumentException("one probe mode required");
    String uri = System.getenv("COMPAT_MONGO_URI");
    String database = System.getenv("COMPAT_DATABASE");
    if (uri == null
        || !uri.matches("mongodb://127\\.0\\.0\\.1:[0-9]+/\\?serverSelectionTimeoutMS=5000")
        || database == null
        || !database.matches("compat_legacy_[a-f0-9]{32}")) {
      throw new IllegalArgumentException("Use the disposable local-container runner only");
    }
    try (MongoClient c = MongoClients.create(uri)) {
      var db = c.getDatabase(database);
      var col = db.getCollection("rules");
      var repo = new MongoRateLimitRuleRepository(col);
      switch (args[0]) {
        case "migrate":
          var legacy = db.getCollection("migration");
          check(legacy.countDocuments() == 0, "migration fixture is empty");
          legacy.createIndex(
              new Document("id", 1),
              new com.mongodb.client.model.IndexOptions().unique(true).name("id_1"));
          var migration = new MongoRateLimitRuleRepository(legacy);
          migration.save(rule("legacy-A", "legacy", 10));
          try {
            migration.getClass().getMethod("ensureIndexes").invoke(migration);
            throw new AssertionError("startup unexpectedly allowed");
          } catch (java.lang.reflect.InvocationTargetException e) {
            check(
                e.getCause() instanceof IllegalStateException,
                "0.5.0 startup refuses legacy global-id constraint");
          }
          check(
              legacy.listIndexes().into(new ArrayList<>()).stream()
                  .anyMatch(
                      x ->
                          x.getString("name").equals("id_1")
                              && Boolean.TRUE.equals(x.getBoolean("unique"))),
              "failed startup preserves legacy unique index");
          migration.getClass().getMethod("migrateLegacyGlobalIdConstraint").invoke(migration);
          migration.getClass().getMethod("ensureIndexes").invoke(migration);
          migration.save(rule("legacy-B", "legacy", 20));
          check(
              legacy.countDocuments() == 2,
              "explicit migration accepts same id across distinct rule sets");
          var indexes = legacy.listIndexes().into(new ArrayList<>());
          check(
              indexes.stream()
                  .anyMatch(
                      x ->
                          x.getString("name").equals("ruleSetId_1_id_1_unique")
                              && Boolean.TRUE.equals(x.getBoolean("unique"))),
              "compound unique constraint exists");
          check(
              indexes.stream()
                  .anyMatch(
                      x ->
                          x.getString("name").equals("id_1")
                              && !Boolean.TRUE.equals(x.getBoolean("unique"))),
              "id lookup is nonunique after migration");
          break;

        case "seed":
          check(col.countDocuments() == 0, "rule fixture is empty");
          repo.getClass().getMethod("ensureIndexes").invoke(repo);
          repo.save(rule("A", "same", 10));
          repo.save(rule("B", "same", 20));
          repo.save(rule("A", "acl-rule", 30));
          repo.getClass()
              .getMethod(
                  "saveAccessControl", String.class, List.class, List.class, Set.class, Set.class)
              .invoke(repo, "A", List.of(), List.of("192.0.2.9"), Set.of(), Set.of("user:blocked"));
          check(col.countDocuments() == 3, "0.5.0 seeded duplicate-id scoped rules plus ACL");
          System.out.println(col.find(Filters.eq("id", "acl-rule")).first().toJson());
          break;
        case "read":
          check(
              repo.findByRuleSetId("A").size() == 2,
              "0.3.7 reads 0.5.0 basic rules with extra ACL fields");
          check(
              repo.findByRuleSetId("B").size() == 1,
              "0.3.7 scoped read distinguishes duplicate ids");
          System.out.println(
              "LEGACY_ID_ONLY_SELECTED_SET=" + repo.findById("same").get().getRuleSetIdOrNull());
          try {
            Class.forName("org.fluxgate.core.config.AccessControl");
            throw new AssertionError("unexpected ACL support");
          } catch (ClassNotFoundException e) {
            System.out.println(
                "PASS 0.3.7 has no AccessControl class; ACL fields are not enforced by legacy rule"
                    + " model");
          }
          break;
        case "write-acl":
          check(
              col.find(Filters.eq("id", "acl-rule")).first().containsKey("deniedIps"),
              "ACL exists before legacy write");
          repo.save(rule("A", "acl-rule", 99));
          var after = col.find(Filters.eq("id", "acl-rule")).first();
          check(
              !after.containsKey("deniedIps") && !after.containsKey("aclUpdatedAt"),
              "REPRODUCED legacy save removes 0.5.0 ACL fields and marker");
          break;
        case "write-duplicate":
          try {
            repo.save(rule("B", "same", 99));
            throw new AssertionError("expected legacy ambiguous save to fail with duplicate key");
          } catch (com.mongodb.MongoWriteException e) {
            check(
                e.getCode() == 11000, "REPRODUCED legacy id-only save hits compound duplicate key");
          }
          break;
        case "delete":
          check(repo.deleteById("same"), "legacy id-only delete succeeds despite ambiguity");
          check(
              col.countDocuments(Filters.eq("id", "same")) == 1,
              "REPRODUCED legacy ambiguous delete removes one rule set without specifying it");
          System.out.println(
              "SURVIVING_SET=" + col.find(Filters.eq("id", "same")).first().getString("ruleSetId"));
          break;
        default:
          throw new IllegalArgumentException("unknown mode: " + args[0]);
      }
    }
  }
}
