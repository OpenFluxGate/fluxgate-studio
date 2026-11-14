package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Time range of a monitoring query, a preset relative to now or an absolute span. */
public record MonitoringRange(String label, long from, long to, long bucketMillis) {

  public static final String CUSTOM = "custom";
  static final String DEFAULT_WINDOW = "1h";
  static final long MAX_SPAN_MILLIS = Duration.ofHours(24).toMillis();
  static final long FUTURE_SLACK_MILLIS = Duration.ofMinutes(1).toMillis();
  static final int MAX_BUCKETS = 120;
  static final long[] BUCKETS = {10_000L, 30_000L, 60_000L, 300_000L, 900_000L};
  static final Map<String, Long> WINDOWS = windows();

  public static MonitoringRange of(String window, Long from, Long to, long now) {
    if (from != null || to != null) {
      return absolute(from, to, now);
    }
    String code = window == null || window.isBlank() ? DEFAULT_WINDOW : window;
    Long length = WINDOWS.get(code);
    if (length == null) {
      throw new InvalidRuleException(
          "window", "must be one of: " + String.join(", ", WINDOWS.keySet()));
    }
    return new MonitoringRange(code, now - length, now, bucketFor(length));
  }

  public long lengthMillis() {
    return to - from;
  }

  public String cacheKey() {
    if (!CUSTOM.equals(label)) {
      return label;
    }
    return Math.floorDiv(from, bucketMillis)
        + ":"
        + Math.floorDiv(to, bucketMillis)
        + ":"
        + bucketMillis;
  }

  static long bucketFor(long span) {
    for (long bucket : BUCKETS) {
      if (span / bucket <= MAX_BUCKETS) {
        return bucket;
      }
    }
    return BUCKETS[BUCKETS.length - 1];
  }

  private static MonitoringRange absolute(Long from, Long to, long now) {
    if (from == null || to == null) {
      throw new InvalidRuleException("from", "must be sent together with to");
    }
    if (from >= to) {
      throw new InvalidRuleException("from", "must be before to");
    }
    if (to - from > MAX_SPAN_MILLIS) {
      throw new InvalidRuleException("from", "must be within 24 hours of to");
    }
    if (to > now + FUTURE_SLACK_MILLIS) {
      throw new InvalidRuleException("to", "must not be in the future");
    }
    return new MonitoringRange(CUSTOM, from, to, bucketFor(to - from));
  }

  private static Map<String, Long> windows() {
    Map<String, Long> windows = new LinkedHashMap<>();
    windows.put("5m", Duration.ofMinutes(5).toMillis());
    windows.put("15m", Duration.ofMinutes(15).toMillis());
    windows.put("1h", Duration.ofHours(1).toMillis());
    windows.put("6h", Duration.ofHours(6).toMillis());
    windows.put("24h", Duration.ofHours(24).toMillis());
    return Collections.unmodifiableMap(windows);
  }
}
