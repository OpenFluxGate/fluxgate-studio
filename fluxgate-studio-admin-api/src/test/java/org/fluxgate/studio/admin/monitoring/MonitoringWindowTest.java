package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;

class MonitoringWindowTest {

  @Test
  void parsesCodesInTheAllowedSet() {
    assertThat(MonitoringWindow.parse("5m", MonitoringWindow.MONITORING))
        .isEqualTo(MonitoringWindow.FIVE_MINUTES);
    assertThat(MonitoringWindow.parse("7d", MonitoringWindow.KEY_LOOKUP))
        .isEqualTo(MonitoringWindow.SEVEN_DAYS);
  }

  @Test
  void rejectsCodesOutsideTheAllowedSet() {
    assertThatThrownBy(() -> MonitoringWindow.parse("7d", MonitoringWindow.MONITORING))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 5m, 1h, 24h");
    assertThatThrownBy(() -> MonitoringWindow.parse(null, MonitoringWindow.MONITORING))
        .isInstanceOf(InvalidRuleException.class);
  }

  @Test
  void exposesLengthsAndBuckets() {
    assertThat(MonitoringWindow.ONE_HOUR.lengthMillis()).isEqualTo(3_600_000L);
    assertThat(MonitoringWindow.ONE_HOUR.bucketMillis()).isEqualTo(60_000L);
    assertThat(MonitoringWindow.FIVE_MINUTES.bucketMillis()).isEqualTo(10_000L);
    assertThat(MonitoringWindow.ONE_DAY.bucketMillis()).isEqualTo(900_000L);
  }
}
