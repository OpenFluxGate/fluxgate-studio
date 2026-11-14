package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class MonitoringWindowTest {

  @Test
  void parsesKeyLookupWindows() {
    assertThat(MonitoringWindow.parse("1h", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.ONE_HOUR);
    assertThat(MonitoringWindow.parse("7d", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.SEVEN_DAYS);
  }

  @Test
  void rejectsOtherCodes() {
    assertThatThrownBy(() -> MonitoringWindow.parse("5m", MonitoringWindow.KEY_LOOKUP))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 1h, 24h, 7d");
    assertThatThrownBy(() -> MonitoringWindow.parse(null, MonitoringWindow.KEY_LOOKUP))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void exposesLengthsAndBuckets() {
    assertThat(MonitoringWindow.ONE_HOUR.lengthMillis()).isEqualTo(3_600_000L);
    assertThat(MonitoringWindow.ONE_HOUR.bucketMillis()).isEqualTo(60_000L);
    assertThat(MonitoringWindow.ONE_DAY.bucketMillis()).isEqualTo(900_000L);
    assertThat(MonitoringWindow.SEVEN_DAYS.bucketMillis()).isEqualTo(21_600_000L);
  }
}
