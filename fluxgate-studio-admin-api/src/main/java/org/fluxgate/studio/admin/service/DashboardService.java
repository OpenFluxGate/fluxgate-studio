package org.fluxgate.studio.admin.service;

import java.time.Instant;
import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.fluxgate.studio.admin.repository.RuleStatistics;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/** Service for dashboard statistics. */
@Service
public class DashboardService {

  private static final Logger log = LoggerFactory.getLogger(DashboardService.class);

  private final StudioRuleRepository studioRuleRepository;

  public DashboardService(StudioRuleRepository studioRuleRepository) {
    this.studioRuleRepository = studioRuleRepository;
  }

  /**
   * Get dashboard statistics.
   *
   * <p>The counters are computed by the storage engine (MongoDB {@code countDocuments} and {@code
   * distinct}) instead of loading every rule into memory.
   *
   * @return dashboard statistics
   */
  public DashboardStatsResponse getStats() {
    log.debug("Fetching dashboard statistics");
    try {
      RuleStatistics statistics = studioRuleRepository.statistics();
      return new DashboardStatsResponse(
          statistics.totalRules(),
          statistics.activeRules(),
          statistics.disabledRules(),
          statistics.totalRuleSets(),
          Instant.now().toString());
    } catch (Exception e) {
      throw new StorageOperationException("getStats", e.getMessage(), e);
    }
  }
}
