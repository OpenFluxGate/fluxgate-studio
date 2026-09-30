package org.fluxgate.studio.admin.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

import org.fluxgate.studio.admin.dto.response.DashboardStatsResponse;
import org.fluxgate.studio.admin.exception.StorageOperationException;
import org.fluxgate.studio.admin.repository.RuleStatistics;
import org.fluxgate.studio.admin.repository.StudioRuleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

  @Mock private StudioRuleRepository studioRuleRepository;

  private DashboardService dashboardService;

  @BeforeEach
  void setUp() {
    dashboardService = new DashboardService(studioRuleRepository);
  }

  @Test
  @DisplayName("should return the counters computed by the storage engine")
  void shouldReturnCorrectStatistics() {
    // given
    when(studioRuleRepository.statistics()).thenReturn(new RuleStatistics(5, 3, 2, 3));

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
  @DisplayName("should handle an empty rule collection")
  void shouldHandleEmptyRuleList() {
    // given
    when(studioRuleRepository.statistics()).thenReturn(new RuleStatistics(0, 0, 0, 0));

    // when
    DashboardStatsResponse stats = dashboardService.getStats();

    // then
    assertThat(stats.totalRules()).isZero();
    assertThat(stats.activeRules()).isZero();
    assertThat(stats.disabledRules()).isZero();
    assertThat(stats.totalRuleSets()).isZero();
  }

  @Test
  @DisplayName("should wrap storage failures")
  void shouldWrapStorageFailures() {
    // given
    when(studioRuleRepository.statistics()).thenThrow(new IllegalStateException("mongo down"));

    // when/then
    assertThatThrownBy(() -> dashboardService.getStats())
        .isInstanceOf(StorageOperationException.class);
  }
}
