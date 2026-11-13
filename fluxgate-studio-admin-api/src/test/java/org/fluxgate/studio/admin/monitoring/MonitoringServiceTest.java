package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
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

    OverviewResponse overview = service.overview(MonitoringWindow.ONE_HOUR);

    assertThat(overview.total()).isEqualTo(15);
    assertThat(overview.rejected()).isEqualTo(3);
    assertThat(overview.rejectRate()).isEqualTo(0.2);
    assertThat(overview.ruleSets()).extracting(RuleSetSummary::ruleSetId).containsExactly("a", "c");
    RuleSetSummary idle = overview.ruleSets().get(1);
    assertThat(idle.total()).isZero();
    assertThat(idle.rejectRate()).isZero();
    assertThat(idle.lastDecisionAt()).isNull();
    assertThat(idle.trend()).hasSize(MonitoringService.TREND_POINTS).containsOnly(0L);
    assertThat(overview.ruleSets().get(0).lastDecisionAt()).isEqualTo(NOW - 5);
  }

  @Test
  void overviewShowsLastDecisionFromTheLast24HoursEvenWithoutCurrentTraffic() {
    when(store.activityByRuleSet(NOW - 300_000, NOW, null)).thenReturn(List.of());
    when(store.activityByRuleSet(NOW - DAY, NOW, null))
        .thenReturn(List.of(new RuleSetActivity("b", 4, 0, NOW - HOUR)));

    OverviewResponse overview = service.overview(MonitoringWindow.FIVE_MINUTES);

    assertThat(overview.ruleSets())
        .singleElement()
        .satisfies(
            summary -> {
              assertThat(summary.ruleSetId()).isEqualTo("b");
              assertThat(summary.total()).isZero();
              assertThat(summary.lastDecisionAt()).isEqualTo(NOW - HOUR);
            });
  }

  @Test
  void overviewTrendCarriesRejectedCountsPerBucket() {
    long bucket = HOUR / MonitoringService.TREND_POINTS;
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull()))
        .thenReturn(List.of(new RuleSetActivity("a", 3, 2, NOW - 1)));
    when(store.bucketsByRuleSet(NOW - HOUR, NOW, bucket))
        .thenReturn(Map.of("a", List.of(new Bucket(NOW - bucket, 1, 2))));

    List<Long> trend = service.overview(MonitoringWindow.ONE_HOUR).ruleSets().get(0).trend();

    assertThat(trend).hasSize(MonitoringService.TREND_POINTS);
    assertThat(trend.get(trend.size() - 1)).isEqualTo(2L);
  }

  @Test
  void overviewIsCachedForTheConfiguredTtl() {
    when(store.activityByRuleSet(anyLong(), anyLong(), isNull())).thenReturn(List.of());

    service.overview(MonitoringWindow.ONE_HOUR);
    service.overview(MonitoringWindow.ONE_HOUR);

    verify(store, times(2)).activityByRuleSet(anyLong(), anyLong(), isNull());
  }

  @Test
  void timeseriesFillsEmptyBuckets() {
    when(store.buckets(NOW - HOUR, NOW, 60_000, "a", null))
        .thenReturn(List.of(new Bucket(NOW - 60_000, 4, 1)));

    TimeseriesResponse series = service.timeseries(MonitoringWindow.ONE_HOUR, "a");

    assertThat(series.bucketMillis()).isEqualTo(60_000);
    assertThat(series.buckets()).hasSize(60);
    assertThat(series.buckets().get(0)).isEqualTo(new Bucket(NOW - HOUR, 0, 0));
    assertThat(series.buckets().get(59)).isEqualTo(new Bucket(NOW - 60_000, 4, 1));
  }

  @Test
  void topRejectedMasksKeysUnlessRevealed() {
    when(store.topRejected(NOW - HOUR, NOW, null, 20))
        .thenReturn(List.of(new RejectedKey("a", "123456789", 3, NOW - 10)));

    assertThat(service.topRejected(MonitoringWindow.ONE_HOUR, null, 20, false))
        .containsExactly(new RejectedKeyResponse("a", "12****89", true, 3, NOW - 10));
    assertThat(service.topRejected(MonitoringWindow.ONE_HOUR, null, 20, true))
        .containsExactly(new RejectedKeyResponse("a", "123456789", false, 3, NOW - 10));
    verify(store, times(1)).topRejected(NOW - HOUR, NOW, null, 20);
  }

  @Test
  void topRejectedRejectsLimitsOutsideTheRange() {
    assertThatThrownBy(() -> service.topRejected(MonitoringWindow.ONE_HOUR, null, 0, true))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.topRejected(MonitoringWindow.ONE_HOUR, null, 101, true))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void fillAlignsToBucketBoundaries() {
    assertThat(MonitoringService.fill(Collections.emptyList(), 90_000, 200_000, 60_000))
        .extracting(Bucket::start)
        .containsExactly(60_000L, 120_000L, 180_000L);
    verify(store, times(0)).buckets(anyLong(), anyLong(), anyLong(), eq("x"), isNull());
  }
}
