package org.fluxgate.studio.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.core.config.RateLimitBand;
import org.fluxgate.core.config.RateLimitRule;
import org.fluxgate.core.spi.RateLimitRuleRepository;
import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

  @Mock private RateLimitRuleRepository ruleRepository;

  private DashboardService dashboardService;

  @BeforeEach
  void setUp() {
    dashboardService = new DashboardService(ruleRepository);
  }

  private RateLimitRule createTestRule(String id, boolean enabled, String ruleSetId) {
    RateLimitRule.Builder builder =
        RateLimitRule.builder(id)
            .name("Test Rule " + id)
            .enabled(enabled)
            .scope(LimitScope.PER_IP)
            .keyStrategyId("ip")
            .onLimitExceedPolicy(OnLimitExceedPolicy.REJECT_REQUEST)
            .ruleSetId(ruleSetId);
    builder.addBand(RateLimitBand.builder(Duration.ofSeconds(60), 100).build());
    return builder.build();
  }

  @Test
  @DisplayName("should return correct statistics")
  void shouldReturnCorrectStatistics() {
    // given
    List<RateLimitRule> rules =
        List.of(
            createTestRule("rule-1", true, "ruleset-a"),
            createTestRule("rule-2", true, "ruleset-a"),
            createTestRule("rule-3", false, "ruleset-b"),
            createTestRule("rule-4", true, "ruleset-c"),
            createTestRule("rule-5", false, null));
    when(ruleRepository.findAll()).thenReturn(rules);

    // when
    DashboardStatsResponse stats = dashboardService.getStats();

    // then
    assertThat(stats.totalRules()).isEqualTo(5);
    assertThat(stats.activeRules()).isEqualTo(3);
    assertThat(stats.disabledRules()).isEqualTo(2);
    assertThat(stats.totalRuleSets()).isEqualTo(3);
    assertThat(stats.lastUpdated()).isNotNull();
  }

  @Test
  @DisplayName("should handle empty rule list")
  void shouldHandleEmptyRuleList() {
    // given
    when(ruleRepository.findAll()).thenReturn(List.of());

    // when
    DashboardStatsResponse stats = dashboardService.getStats();

    // then
    assertThat(stats.totalRules()).isZero();
    assertThat(stats.activeRules()).isZero();
    assertThat(stats.disabledRules()).isZero();
    assertThat(stats.totalRuleSets()).isZero();
  }

  @Test
  @DisplayName("should count only non-null rule set IDs")
  void shouldCountOnlyNonNullRuleSetIds() {
    // given
    List<RateLimitRule> rules =
        List.of(
            createTestRule("rule-1", true, "ruleset-a"),
            createTestRule("rule-2", true, null),
            createTestRule("rule-3", true, ""),
            createTestRule("rule-4", true, "ruleset-a"));
    when(ruleRepository.findAll()).thenReturn(rules);

    // when
    DashboardStatsResponse stats = dashboardService.getStats();

    // then
    assertThat(stats.totalRuleSets()).isEqualTo(1);
  }
}
