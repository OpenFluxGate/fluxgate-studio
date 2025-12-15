package org.fluxgate.studio.admin.service;

import java.time.Instant;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Service for dashboard statistics. */
@Service
public class DashboardService {

  private static final Logger log = LoggerFactory.getLogger(DashboardService.class);

  private final RateLimitRuleRepository ruleRepository;

  public DashboardService(RateLimitRuleRepository ruleRepository) {
    this.ruleRepository = ruleRepository;
  }

  /**
   * Get dashboard statistics.
   *
   * @return dashboard statistics
   */
  public DashboardStatsResponse getStats() {
    log.debug("Fetching dashboard statistics");
    try {
      List<RateLimitRule> allRules = ruleRepository.findAll();

      long totalRules = allRules.size();
      long activeRules = allRules.stream().filter(RateLimitRule::isEnabled).count();
      long disabledRules = totalRules - activeRules;

      Set<String> ruleSets =
          allRules.stream()
              .map(RateLimitRule::getRuleSetIdOrNull)
              .filter(id -> id != null && !id.isEmpty())
              .collect(Collectors.toSet());

      return new DashboardStatsResponse(
          totalRules, activeRules, disabledRules, ruleSets.size(), Instant.now().toString());
    } catch (Exception e) {
      throw new StorageOperationException("getStats", e.getMessage(), e);
    }
  }
}
