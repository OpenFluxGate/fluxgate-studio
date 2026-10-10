package org.fluxgate.studio.admin.repository;

import java.util.List;
import java.util.Optional;
import org.fluxgate.core.config.RateLimitRule;

/**
 * Studio specific rule queries that the core {@link org.fluxgate.core.spi.RateLimitRuleRepository}
 * SPI does not expose.
 *
 * <p>The admin console needs server side paging, counters and compare-and-set writes. Pushing those
 * down to the storage engine keeps the console responsive when the rule collection grows.
 */
public interface StudioRuleRepository {

  /**
   * Find a single page of rules ordered by rule id.
   *
   * @param ruleSetId optional rule set filter, {@code null} or blank for all rule sets
   * @param offset number of rules to skip
   * @param limit maximum number of rules to return
   * @return the requested page (never {@code null})
   */
  List<RateLimitRule> findPage(String ruleSetId, int offset, int limit);

  /**
   * Count the rules matching the optional rule set filter.
   *
   * @param ruleSetId optional rule set filter, {@code null} or blank for all rule sets
   * @return number of matching rules
   */
  long count(String ruleSetId);

  /**
   * Compute the dashboard counters.
   *
   * @return the aggregated counters
   */
  RuleStatistics statistics();

  /** Storage-specific identity normalization (Mongo maps absent sets to default). */
  default String normalizeRuleSetId(String ruleSetId) {
    return ruleSetId;
  }

  /** Resolves a legacy ID, refusing ambiguous matches. */
  Optional<RateLimitRule> findById(String id);

  /** Finds an exact pair; null identifies rules without a rule set. */
  Optional<RateLimitRule> findById(String ruleSetId, String id);

  /** Deletes an exact pair only. */
  boolean deleteById(String ruleSetId, String id);

  /** Inserts without replacing an existing policy with the same (ruleSetId, id). */
  boolean insertIfAbsent(RateLimitRule rule);

  /**
   * Replace a rule only when the stored optimistic locking token still matches.
   *
   * @param rule the rule to store, already carrying the next version
   * @param expectedVersion the version the caller read before editing
   * @return {@code true} when the rule was replaced, {@code false} on a version mismatch
   */
  boolean replaceIfVersionMatches(RateLimitRule rule, long expectedVersion);
}
