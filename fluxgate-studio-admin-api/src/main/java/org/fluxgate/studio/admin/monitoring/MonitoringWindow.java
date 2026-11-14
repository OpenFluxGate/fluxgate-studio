package org.fluxgate.studio.admin.monitoring;

import java.time.Duration;
import java.util.EnumSet;
import java.util.Set;
import java.util.stream.Collectors;
import org.fluxgate.studio.admin.exception.InvalidRuleException;

/** Key lookup windows. Fixed windows bound every lookup an operator can run. */
public enum MonitoringWindow {
  ONE_HOUR("1h", Duration.ofHours(1), Duration.ofMinutes(1)),
  ONE_DAY("24h", Duration.ofHours(24), Duration.ofMinutes(15)),
  SEVEN_DAYS("7d", Duration.ofDays(7), Duration.ofHours(6));

  public static final Set<MonitoringWindow> KEY_LOOKUP = EnumSet.of(ONE_HOUR, ONE_DAY, SEVEN_DAYS);

  private final String code;
  private final Duration length;
  private final Duration bucket;

  MonitoringWindow(String code, Duration length, Duration bucket) {
    this.code = code;
    this.length = length;
    this.bucket = bucket;
  }

  public String code() {
    return code;
  }

  public long lengthMillis() {
    return length.toMillis();
  }

  public long bucketMillis() {
    return bucket.toMillis();
  }

  public static MonitoringWindow parse(String value, Set<MonitoringWindow> allowed) {
    for (MonitoringWindow window : allowed) {
      if (window.code.equals(value)) {
        return window;
      }
    }
    throw new InvalidRuleException(
        "window",
        "must be one of: "
            + allowed.stream().map(MonitoringWindow::code).collect(Collectors.joining(", ")));
  }
}
