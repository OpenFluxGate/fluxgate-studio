package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class TtlCacheTest {
  private final MutableClock clock = new MutableClock(Instant.parse("2026-11-14T00:00:00Z"));

  @Test
  void reusesTheValueUntilTheTtlPasses() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    AtomicInteger loads = new AtomicInteger();

    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(1);
    clock.advance(Duration.ofSeconds(9));
    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(1);
    clock.advance(Duration.ofSeconds(1));
    assertThat(cache.get("k", loads::incrementAndGet)).isEqualTo(2);
  }

  @Test
  void keepsKeysApart() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    assertThat(cache.get("a", () -> "A")).isEqualTo("A");
    assertThat(cache.get("b", () -> "B")).isEqualTo("B");
  }

  @Test
  void zeroTtlDisablesCaching() {
    TtlCache cache = new TtlCache(Duration.ZERO, clock);
    AtomicInteger loads = new AtomicInteger();
    cache.get("k", loads::incrementAndGet);
    cache.get("k", loads::incrementAndGet);
    assertThat(loads).hasValue(2);
  }

  @Test
  void dropsExpiredEntriesWhenItGrows() {
    TtlCache cache = new TtlCache(Duration.ofSeconds(10), clock);
    for (int i = 0; i < TtlCache.MAX_ENTRIES; i++) {
      cache.get("k" + i, () -> "v");
    }
    clock.advance(Duration.ofSeconds(11));
    cache.get("fresh", () -> "v");
    assertThat(cache.size()).isEqualTo(1);
  }
}
