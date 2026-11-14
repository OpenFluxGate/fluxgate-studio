package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.service.RuleService;
import org.springframework.stereotype.Service;

/** Aggregates decision history for the console overview, trend chart and top rejected keys. */
@Service
public class MonitoringService {

  static final int TREND_POINTS = 12;
  static final int MAX_TOP_KEYS = 100;
  private static final long DAY_MILLIS = Duration.ofDays(1).toMillis();

  private final MongoEventStore store;
  private final RuleService ruleService;
  private final TtlCache cache;

  public MonitoringService(
      MongoEventStore store,
      RuleService ruleService,
      MonitoringProperties properties,
      Clock clock) {
    this.store = store;
    this.ruleService = ruleService;
    this.cache = new TtlCache(properties.cacheTtl(), clock);
  }

  public OverviewResponse overview(MonitoringRange range) {
    return cache.get("overview:" + range.cacheKey(), () -> computeOverview(range));
  }

  public TimeseriesResponse timeseries(MonitoringRange range, String ruleSetId) {
    return cache.get(
        "timeseries:" + range.cacheKey() + ":" + ruleSetId,
        () ->
            new TimeseriesResponse(
                range.label(),
                range.from(),
                range.to(),
                range.bucketMillis(),
                fill(
                    store.buckets(range.from(), range.to(), range.bucketMillis(), ruleSetId, null),
                    range.from(),
                    range.to(),
                    range.bucketMillis())));
  }

  public List<RejectedKeyResponse> topRejected(
      MonitoringRange range, String ruleSetId, int limit, boolean revealKeys) {
    if (limit < 1 || limit > MAX_TOP_KEYS) {
      throw new InvalidRuleException("limit", "must be between 1 and " + MAX_TOP_KEYS);
    }
    List<RejectedKey> keys =
        cache.get(
            "top:" + range.cacheKey() + ":" + ruleSetId + ":" + limit,
            () -> store.topRejected(range.from(), range.to(), ruleSetId, limit));
    return keys.stream()
        .map(
            key ->
                new RejectedKeyResponse(
                    key.ruleSetId(),
                    revealKeys ? key.key() : KeyMasker.mask(key.key()),
                    !revealKeys,
                    key.rejected(),
                    key.lastRejectedAt()))
        .toList();
  }

  public static List<Bucket> fill(List<Bucket> sparse, long from, long to, long bucketMillis) {
    Map<Long, Bucket> byStart = new HashMap<>();
    for (Bucket bucket : sparse) {
      byStart.put(bucket.start(), bucket);
    }
    List<Bucket> filled = new ArrayList<>();
    for (long start = from - Math.floorMod(from, bucketMillis); start < to; start += bucketMillis) {
      filled.add(byStart.getOrDefault(start, new Bucket(start, 0, 0)));
    }
    return filled;
  }

  static double rate(long rejected, long total) {
    return total == 0 ? 0 : (double) rejected / total;
  }

  private OverviewResponse computeOverview(MonitoringRange range) {
    long from = range.from();
    long to = range.to();
    long trendBucket = Math.max(1, range.lengthMillis() / TREND_POINTS);

    Map<String, RuleSetActivity> activity = new HashMap<>();
    long total = 0;
    long rejected = 0;
    for (RuleSetActivity entry : store.activityByRuleSet(from, to, null)) {
      total += entry.total();
      rejected += entry.rejected();
      if (entry.ruleSetId() != null) {
        activity.put(entry.ruleSetId(), entry);
      }
    }

    Map<String, Long> lastSeen = new HashMap<>();
    for (RuleSetActivity entry : store.activityByRuleSet(to - DAY_MILLIS, to, null)) {
      if (entry.ruleSetId() != null) {
        lastSeen.put(entry.ruleSetId(), entry.lastDecisionAt());
      }
    }

    Set<String> ids = new TreeSet<>(activity.keySet());
    ids.addAll(lastSeen.keySet());
    for (RuleResponse rule : ruleService.getAllRules()) {
      if (rule.ruleSetId() != null) {
        ids.add(rule.ruleSetId());
      }
    }

    Map<String, List<Bucket>> trends = store.bucketsByRuleSet(from, to, trendBucket);
    List<RuleSetSummary> summaries = new ArrayList<>();
    for (String id : ids) {
      RuleSetActivity entry = activity.get(id);
      long ruleSetTotal = entry == null ? 0 : entry.total();
      long ruleSetRejected = entry == null ? 0 : entry.rejected();
      List<Bucket> filled = fill(trends.getOrDefault(id, List.of()), from, to, trendBucket);
      List<Long> trend =
          filled.subList(Math.max(0, filled.size() - TREND_POINTS), filled.size()).stream()
              .map(Bucket::rejected)
              .toList();
      summaries.add(
          new RuleSetSummary(
              id,
              ruleSetTotal,
              ruleSetRejected,
              rate(ruleSetRejected, ruleSetTotal),
              lastSeen.get(id),
              trend));
    }
    summaries.sort(
        Comparator.comparingLong(RuleSetSummary::rejected)
            .reversed()
            .thenComparing(Comparator.comparingLong(RuleSetSummary::total).reversed())
            .thenComparing(RuleSetSummary::ruleSetId));
    return new OverviewResponse(
        range.label(), from, to, total, rejected, rate(rejected, total), summaries);
  }
}
