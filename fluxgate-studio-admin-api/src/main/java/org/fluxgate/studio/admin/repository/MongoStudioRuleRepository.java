package org.fluxgate.studio.admin.repository;

import com.mongodb.MongoWriteException;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleConverter;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleMongoConverter;
import org.fluxgate.adapter.mongo.repository.MongoRateLimitRuleRepository;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.studio.admin.exception.AmbiguousRuleException;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * MongoDB implementation of {@link StudioRuleRepository}.
 *
 * <p>Paging uses {@code skip}/{@code limit}, the dashboard counters use {@code countDocuments} and
 * {@code distinct}, and the optimistic locking write is a single conditional {@code replaceOne}.
 * Nothing loads the whole collection into memory.
 */
public class MongoStudioRuleRepository implements StudioRuleRepository {

  private static final Logger log = LoggerFactory.getLogger(MongoStudioRuleRepository.class);

  private static final String FIELD_ID = "id";
  private static final String FIELD_ENABLED = "enabled";
  private static final String FIELD_RULE_SET_ID = "ruleSetId";

  private final MongoCollection<Document> collection;

  public MongoStudioRuleRepository(MongoCollection<Document> collection) {
    this.collection = collection;
    new MongoRateLimitRuleRepository(collection).ensureIndexes();
  }

  @Override
  public List<RateLimitRule> findPage(String ruleSetId, int offset, int limit) {
    List<Document> documents =
        collection
            .find(filter(ruleSetId))
            .sort(Sorts.ascending(FIELD_ID, FIELD_RULE_SET_ID))
            .skip(offset)
            .limit(limit)
            .into(new ArrayList<>());

    List<RateLimitRule> rules = new ArrayList<>(documents.size());
    for (Document document : documents) {
      rules.add(domain(document));
    }
    return rules;
  }

  @Override
  public long count(String ruleSetId) {
    return collection.countDocuments(filter(ruleSetId));
  }

  @Override
  public RuleStatistics statistics() {
    long totalRules = collection.countDocuments(new Document());
    long activeRules = collection.countDocuments(Filters.eq(FIELD_ENABLED, true));
    long totalRuleSets = countRuleSets();
    return new RuleStatistics(totalRules, activeRules, totalRules - activeRules, totalRuleSets);
  }

  @Override
  public Optional<RateLimitRule> findById(String id) {
    List<Document> matches =
        collection.find(Filters.eq(FIELD_ID, id)).limit(2).into(new ArrayList<>());
    if (matches.size() > 1) throw new AmbiguousRuleException();
    return matches.isEmpty() ? Optional.empty() : Optional.of(domain(matches.getFirst()));
  }

  @Override
  public Optional<RateLimitRule> findById(String ruleSetId, String id) {
    Document document = collection.find(identity(ruleSetId, id)).first();
    return document == null ? Optional.empty() : Optional.of(domain(document));
  }

  @Override
  public boolean deleteById(String ruleSetId, String id) {
    return collection.deleteOne(identity(ruleSetId, id)).getDeletedCount() > 0;
  }

  private Bson identity(String ruleSetId, String id) {
    return Filters.and(Filters.eq(FIELD_RULE_SET_ID, ruleSetId), Filters.eq(FIELD_ID, id));
  }

  private RateLimitRule domain(Document document) {
    return RateLimitRuleConverter.toDomain(RateLimitRuleMongoConverter.fromBson(document));
  }

  @Override
  public String normalizeRuleSetId(String ruleSetId) {
    return ruleSetId == null ? "default" : ruleSetId;
  }

  @Override
  public boolean insertIfAbsent(RateLimitRule rule) {
    try {
      collection.insertOne(
          RateLimitRuleMongoConverter.toBson(RateLimitRuleConverter.toDocument(rule)));
      return true;
    } catch (MongoWriteException e) {
      if (e.getError().getCode() == 11000) {
        return false;
      }
      throw e;
    }
  }

  @Override
  @SuppressWarnings("unchecked")
  public boolean replaceIfVersionMatches(RateLimitRule rule, long expectedVersion) {
    Document current = collection.find(identity(rule.getRuleSetIdOrNull(), rule.getId())).first();
    if (current == null) {
      return false;
    }
    Map<String, Object> attributes = current.get("attributes", Map.class);
    if (RuleVersions.versionOf(attributes) != expectedVersion) {
      return false;
    }
    Document editable = RateLimitRuleMongoConverter.toBson(RateLimitRuleConverter.toDocument(rule));
    Document replacement = new Document(current);
    // DTOs intentionally expose only this subset. A converter built against an older model can
    // emit defaults for fields it did not read; never overwrite matcher, ACL, or extension fields.
    for (String field :
        List.of("name", "enabled", "scope", "keyStrategyId", "onLimitExceedPolicy", "ruleSetId")) {
      if (editable.containsKey(field)) {
        replacement.put(field, editable.get(field));
      } else {
        replacement.remove(field);
      }
    }
    Document mergedAttributes = attributes == null ? new Document() : new Document(attributes);
    mergedAttributes.putAll(rule.getAttributes());
    replacement.put("attributes", mergedAttributes);
    replacement.put(
        "bands",
        mergeBands(
            current.getList("bands", Document.class), editable.getList("bands", Document.class)));

    // Matching the entire snapshot also detects writers that change BSON without bumping Studio's
    // version. Otherwise a read/merge/replace could erase their concurrent ACL or matcher change.
    Bson filter =
        Filters.and(
            identity(rule.getRuleSetIdOrNull(), rule.getId()),
            new Document(
                "$expr",
                new Document("$eq", List.of("$$ROOT", new Document("$literal", current)))));
    long matched = collection.replaceOne(filter, replacement).getMatchedCount();
    log.debug(
        "Conditional replace of rule {} at version {}: matched={}",
        rule.getId(),
        expectedVersion,
        matched);
    return matched > 0;
  }

  private List<Document> mergeBands(List<Document> stored, List<Document> edited) {
    List<Document> result = new ArrayList<>();
    Set<Integer> used = new HashSet<>();
    for (Document band : edited) {
      List<Integer> matches = new ArrayList<>();
      String label = band.getString("label");
      for (int i = 0; i < stored.size(); i++) {
        Document candidate = stored.get(i);
        String oldLabel = candidate.getString("label");
        boolean explicitLabel = label != null && !label.isBlank() && !"default".equals(label);
        boolean match =
            explicitLabel
                ? label.equals(oldLabel)
                : ((oldLabel == null || oldLabel.isBlank() || "default".equals(oldLabel))
                    && java.util.Objects.equals(
                        band.get("windowSeconds"), candidate.get("windowSeconds")));
        if (match) matches.add(i);
      }
      if (matches.size() > 1 || (matches.size() == 1 && !used.add(matches.getFirst()))) {
        throw new InvalidRuleException(
            "bands", "ambiguous band identity; use distinct stable labels");
      }
      Document merged =
          matches.isEmpty() ? new Document() : new Document(stored.get(matches.getFirst()));
      if (merged.get("quotaPeriod") != null
          && !java.util.Objects.equals(merged.get("windowSeconds"), band.get("windowSeconds"))) {
        throw new InvalidRuleException(
            "bands", "cannot change a calendar quota duration through the legacy DTO");
      }
      for (String field : List.of("windowSeconds", "capacity", "label")) {
        // The converter supplies "default" when a persisted label is absent. Keep that absence
        // rather than changing the storage key of an otherwise untouched band during a toggle.
        if ("label".equals(field)
            && !matches.isEmpty()
            && "default".equals(label)
            && (merged.getString("label") == null || merged.getString("label").isBlank())) {
          continue;
        }
        if (band.containsKey(field)) merged.put(field, band.get(field));
        else merged.remove(field);
      }
      result.add(merged);
    }
    for (int i = 0; i < stored.size(); i++) {
      if (!used.contains(i)
          && stored.get(i).keySet().stream()
              .anyMatch(key -> !List.of("windowSeconds", "capacity", "label").contains(key))) {
        throw new InvalidRuleException(
            "bands",
            "cannot remove or rename an extended band through the legacy DTO; keep its stable label");
      }
    }
    return result;
  }

  private long countRuleSets() {
    List<String> ruleSetIds =
        collection.distinct(FIELD_RULE_SET_ID, String.class).into(new ArrayList<>());
    Set<String> ruleSets = new HashSet<>();
    for (String ruleSetId : ruleSetIds) {
      if (ruleSetId != null && !ruleSetId.isEmpty()) {
        ruleSets.add(ruleSetId);
      }
    }
    return ruleSets.size();
  }

  private Bson filter(String ruleSetId) {
    return (ruleSetId == null || ruleSetId.isBlank())
        ? new Document()
        : Filters.eq(FIELD_RULE_SET_ID, ruleSetId);
  }
}
