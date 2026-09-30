package org.fluxgate.studio.admin.repository;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;

/**
 * Fallback {@link StudioRuleRepository} for storage backends that only implement the core {@link
 * RateLimitRuleRepository} SPI.
 *
 * <p>Paging and counting happen in memory, and the conditional write degrades to
 * read-compare-write, so this implementation is only selected when no MongoDB rule collection is
 * available.
 */
public class DelegatingStudioRuleRepository implements StudioRuleRepository {

  private final RateLimitRuleRepository ruleRepository;

  public DelegatingStudioRuleRepository(RateLimitRuleRepository ruleRepository) {
    this.ruleRepository = ruleRepository;
  }

  @Override
  public List<RateLimitRule> findPage(String ruleSetId, int offset, int limit) {
    return findRules(ruleSetId).stream()
        .sorted(Comparator.comparing(RateLimitRule::getId))
        .skip(offset)
        .limit(limit)
        .toList();
  }

  @Override
  public long count(String ruleSetId) {
    return findRules(ruleSetId).size();
  }

  @Override
  public RuleStatistics statistics() {
    List<RateLimitRule> rules = ruleRepository.findAll();
    long totalRules = rules.size();
    long activeRules = rules.stream().filter(RateLimitRule::isEnabled).count();
    long totalRuleSets =
        rules.stream()
            .map(RateLimitRule::getRuleSetIdOrNull)
            .filter(id -> id != null && !id.isEmpty())
            .distinct()
            .count();
    return new RuleStatistics(totalRules, activeRules, totalRules - activeRules, totalRuleSets);
  }

  @Override
  public boolean replaceIfVersionMatches(RateLimitRule rule, long expectedVersion) {
    Optional<RateLimitRule> stored = ruleRepository.findById(rule.getId());
    if (stored.isEmpty() || RuleVersions.versionOf(stored.get()) != expectedVersion) {
      return false;
    }
    ruleRepository.save(rule);
    return true;
  }

  private List<RateLimitRule> findRules(String ruleSetId) {
    return (ruleSetId == null || ruleSetId.isBlank())
        ? ruleRepository.findAll()
        : ruleRepository.findByRuleSetId(ruleSetId);
  }
}
