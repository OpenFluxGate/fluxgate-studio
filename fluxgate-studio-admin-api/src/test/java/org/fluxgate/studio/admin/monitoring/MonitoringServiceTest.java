package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.service.RuleService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class MonitoringServiceTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long HOUR = 3_600_000L;
  private static final long DAY = 86_400_000L;

  private final MongoEventStore store = mock(MongoEventStore.class);
  private final RuleService ruleService = mock(RuleService.class);
  private MonitoringService service;

  @BeforeEach
  void setUp() {
    MonitoringProperties properties =
        new MonitoringProperties(
            "",
            "rate_limit_events",
            true,
            Duration.ofSeconds(10),
            Duration.ofSeconds(5),
            List.of("none", "sha256"));
    service =
        new MonitoringService(
            store, ruleService, properties, Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
    when(ruleService.getAllRules()).thenReturn(List.of());
    when(store.bucketsByRuleSet(anyLong(), anyLong(), anyLong())).thenReturn(Map.of());
  }

  private static MonitoringRange range(String window) {
    return MonitoringRange.of(window, null, null, NOW);
  }

  private static RuleResponse rule(String ruleSetId) {
    return new RuleResponse(
        ruleSetId + "-rule",
        "n",
        true,
        "PER_USER",
        "userId",
        "REJECT_REQUEST",
        List.of(),
        ruleSetId,
        List.of(),
        Map.of(),
        1L);
  }

  @Test
  void overviewTotalsEveryDecisionAndListsRegisteredRuleSetsWithoutTraffic() {
    when(store.activityByRuleSet(NOW - HOUR, NOW, null))
        .thenReturn(
            List.of(
                new RuleSetActivity("a", 10, 2, NOW - 5), new RuleSetActivity(null, 5, 1, NOW)));
    when(store.activityByRuleSet(NOW - DAY, NOW, null))
        .thenReturn(List.of(new RuleSetActivity("a", 30, 3, NOW - 5)));
    when(ruleService.getAllRules()).thenReturn(List.of(rule("c")));

    OverviewResponse overview = service.overview(range("1h"));

    assertThat(overview.window()).isEqualTo("1h");
    assertThat(overview.total()).isEqualTo(15);
    assertThat(overview.rejected()).isEqualTo(3);
    assertThat(overview.rejectRate()).isEqualTo(0.2);
    assertThat(overview.ruleSets()).extracting(RuleSetSummary::ruleSetId).containsExactly("a", "c");
    RuleSetSummary idle = overview.ruleSets().get(1);
    assertThat(idle.total()).isZero();
    assertThat(idle.lastDecisionAt()).isNull();
    assertThat(idle.trend()).hasSize(MonitoringService.TREND_POINTS).containsOnly(0L);
  }

  @Test
  void overviewTrendCarriesRejectedCountsPerBucket() {
    long bucket = HOUR / MonitoringService.TREND_POINTS;
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull()))
        .thenReturn(List.of(new RuleSetActivity("a", 3, 2, NOW - 1)));
    when(store.bucketsByRuleSet(NOW - HOUR, NOW, bucket))
        .thenReturn(Map.of("a", List.of(new Bucket(NOW - bucket, 1, 2))));

    List<Long> trend = service.overview(range("1h")).ruleSets().get(0).trend();

    assertThat(trend).hasSize(MonitoringService.TREND_POINTS);
    assertThat(trend.get(trend.size() - 1)).isEqualTo(2L);
  }

  @Test
  void overviewIsCachedPerRange() {
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull())).thenReturn(List.of());

    service.overview(range("1h"));
    service.overview(range("1h"));
    service.overview(range("6h"));

    verify(store, times(4)).activityByRuleSet(anyLong(), anyLong(), isNull());
  }

  @Test
  void timeseriesUsesTheRangeBucketAndFillsGaps() {
    when(store.buckets(NOW - HOUR, NOW, 30_000, "a", null))
        .thenReturn(List.of(new Bucket(NOW - 30_000, 4, 1)));

    TimeseriesResponse series = service.timeseries(range("1h"), "a");

    assertThat(series.window()).isEqualTo("1h");
    assertThat(series.bucketMillis()).isEqualTo(30_000);
    assertThat(series.buckets()).hasSize(120);
    assertThat(series.buckets().get(0)).isEqualTo(new Bucket(NOW - HOUR, 0, 0));
    assertThat(series.buckets().get(119)).isEqualTo(new Bucket(NOW - 30_000, 4, 1));
  }

  @Test
  void timeseriesReportsAbsoluteRangesAsCustom() {
    MonitoringRange custom = MonitoringRange.of(null, NOW - 600_000, NOW - 300_000, NOW);
    when(store.buckets(NOW - 600_000, NOW - 300_000, 10_000, null, null)).thenReturn(List.of());

    TimeseriesResponse series = service.timeseries(custom, null);

    assertThat(series.window()).isEqualTo("custom");
    assertThat(series.buckets()).hasSize(30);
  }

  @Test
  void topRejectedMasksKeysUnlessRevealed() {
    when(store.topRejected(NOW - HOUR, NOW, null, 20))
        .thenReturn(List.of(new RejectedKey("a", "123456789", 3, NOW - 10)));

    assertThat(service.topRejected(range("1h"), null, 20, false))
        .containsExactly(new RejectedKeyResponse("a", "12****89", true, 3, NOW - 10));
    assertThat(service.topRejected(range("1h"), null, 20, true))
        .containsExactly(new RejectedKeyResponse("a", "123456789", false, 3, NOW - 10));
    verify(store, times(1)).topRejected(NOW - HOUR, NOW, null, 20);
  }

  @Test
  void topRejectedRejectsLimitsOutsideTheRange() {
    assertThatThrownBy(() -> service.topRejected(range("1h"), null, 0, true))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.topRejected(range("1h"), null, 101, true))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void fillAlignsToBucketBoundaries() {
    assertThat(MonitoringService.fill(Collections.emptyList(), 90_000, 200_000, 60_000))
        .extracting(Bucket::start)
        .containsExactly(60_000L, 120_000L, 180_000L);
  }
}
