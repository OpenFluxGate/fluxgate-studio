package org.fluxgate.studio.admin.repository;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.exception.AmbiguousRuleException;

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
  public Optional<RateLimitRule> findById(String id) {
    List<RateLimitRule> matches =
        ruleRepository.findAll().stream().filter(rule -> id.equals(rule.getId())).limit(2).toList();
    if (matches.size() > 1) throw new AmbiguousRuleException();
    return matches.stream().findFirst();
  }

  @Override
  public Optional<RateLimitRule> findById(String ruleSetId, String id) {
    return (ruleSetId == null
            ? ruleRepository.findAll()
            : ruleRepository.findByRuleSetId(ruleSetId))
        .stream()
            .filter(
                rule ->
                    id.equals(rule.getId()) && Objects.equals(ruleSetId, rule.getRuleSetIdOrNull()))
            .findFirst();
  }

  @Override
  public synchronized boolean deleteById(String ruleSetId, String id) {
    Optional<RateLimitRule> existing = findById(id);
    return existing.isPresent()
        && Objects.equals(ruleSetId, existing.get().getRuleSetIdOrNull())
        && ruleRepository.deleteById(id);
  }

  @Override
  public synchronized boolean insertIfAbsent(RateLimitRule rule) {
    if (ruleRepository.existsById(rule.getId())) {
      return false;
    }
    ruleRepository.save(rule);
    return true;
  }

  @Override
  public synchronized boolean replaceIfVersionMatches(RateLimitRule rule, long expectedVersion) {
    Optional<RateLimitRule> stored = findById(rule.getId());
    if (stored.isEmpty()
        || !Objects.equals(stored.get().getRuleSetIdOrNull(), rule.getRuleSetIdOrNull())
        || RuleVersions.versionOf(stored.get()) != expectedVersion) {
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
