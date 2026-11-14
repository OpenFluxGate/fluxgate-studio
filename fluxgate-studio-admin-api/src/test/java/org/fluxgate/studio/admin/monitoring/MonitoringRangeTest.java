package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

class MonitoringRangeTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long MINUTE = 60_000L;
  private static final long HOUR = 3_600_000L;

  @ParameterizedTest
  @CsvSource({
    "5m,300000,10000",
    "15m,900000,10000",
    "1h,3600000,30000",
    "6h,21600000,300000",
    "24h,86400000,900000"
  })
  void presetsPickTheSmallestBucketWithAtMost120Points(String window, long length, long bucket) {
    MonitoringRange range = MonitoringRange.of(window, null, null, NOW);

    assertThat(range).isEqualTo(new MonitoringRange(window, NOW - length, NOW, bucket));
    assertThat(range.cacheKey()).isEqualTo(window);
  }

  @Test
  void defaultsToTheLastHour() {
    assertThat(MonitoringRange.of(null, null, null, NOW).label()).isEqualTo("1h");
    assertThat(MonitoringRange.of(" ", null, null, NOW).label()).isEqualTo("1h");
  }

  @Test
  void rejectsUnknownPresets() {
    assertThatThrownBy(() -> MonitoringRange.of("7d", null, null, NOW))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be one of: 5m, 15m, 1h, 6h, 24h");
  }

  @Test
  void acceptsAnAbsoluteRangeAndPrefersItOverAPreset() {
    MonitoringRange range = MonitoringRange.of("24h", NOW - 10 * MINUTE, NOW - MINUTE, NOW);

    assertThat(range)
        .isEqualTo(new MonitoringRange("custom", NOW - 10 * MINUTE, NOW - MINUTE, 10_000));
    assertThat(range.lengthMillis()).isEqualTo(9 * MINUTE);
  }

  @Test
  void roundsTheCacheKeyOfAnAbsoluteRangeToItsBuckets() {
    MonitoringRange a = MonitoringRange.of(null, NOW - HOUR + 1_000, NOW - 1_000, NOW);
    MonitoringRange b = MonitoringRange.of(null, NOW - HOUR + 2_000, NOW - 2_000, NOW);

    assertThat(a.cacheKey()).isEqualTo(b.cacheKey());
  }

  @Test
  void rejectsBrokenAbsoluteRanges() {
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW - HOUR, null, NOW))
        .isInstanceOf(InvalidRuleException.class)
        .hasMessageContaining("must be sent together with to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW, NOW - HOUR, NOW))
        .hasMessageContaining("must be before to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW - 25 * HOUR, NOW, NOW))
        .hasMessageContaining("must be within 24 hours of to");
    assertThatThrownBy(() -> MonitoringRange.of(null, NOW, NOW + 2 * MINUTE, NOW))
        .hasMessageContaining("must not be in the future");
  }

  @Test
  void toleratesSmallClockSkew() {
    assertThat(MonitoringRange.of(null, NOW - HOUR, NOW + 30_000, NOW).label()).isEqualTo("custom");
  }
}
