package org.fluxgate.studio.admin.repository;

import com.mongodb.client.MongoCollection;
import com.mongodb.client.model.Filters;
import com.mongodb.client.model.Sorts;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.bson.Document;
import org.bson.conversions.Bson;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleConverter;
import org.fluxgate.adapter.mongo.converter.RateLimitRuleMongoConverter;
import org.fluxgate.core.config.RateLimitRule;
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
  private static final String FIELD_VERSION = "attributes." + RuleVersions.VERSION_ATTRIBUTE;

  private final MongoCollection<Document> collection;

  public MongoStudioRuleRepository(MongoCollection<Document> collection) {
    this.collection = collection;
  }

  @Override
  public List<RateLimitRule> findPage(String ruleSetId, int offset, int limit) {
    List<Document> documents =
        collection
            .find(filter(ruleSetId))
            .sort(Sorts.ascending(FIELD_ID))
            .skip(offset)
            .limit(limit)
            .into(new ArrayList<>());

    List<RateLimitRule> rules = new ArrayList<>(documents.size());
    for (Document document : documents) {
      rules.add(RateLimitRuleConverter.toDomain(RateLimitRuleMongoConverter.fromBson(document)));
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
  public boolean replaceIfVersionMatches(RateLimitRule rule, long expectedVersion) {
    // Same conversion path as MongoRateLimitRuleRepository.save, so a conditional replace writes
    // exactly the document an unconditional save would have written.
    Document replacement =
        RateLimitRuleMongoConverter.toBson(RateLimitRuleConverter.toDocument(rule));
    Bson filter =
        Filters.and(Filters.eq(FIELD_ID, rule.getId()), Filters.eq(FIELD_VERSION, expectedVersion));
    long matched = collection.replaceOne(filter, replacement).getMatchedCount();
    if (matched == 0 && expectedVersion == RuleVersions.INITIAL_VERSION) {
      // Rules written before optimistic locking was introduced carry no version attribute.
      matched =
          collection
              .replaceOne(
                  Filters.and(
                      Filters.eq(FIELD_ID, rule.getId()), Filters.exists(FIELD_VERSION, false)),
                  replacement)
              .getMatchedCount();
    }
    log.debug(
        "Conditional replace of rule {} at version {}: matched={}",
        rule.getId(),
        expectedVersion,
        matched);
    return matched > 0;
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
