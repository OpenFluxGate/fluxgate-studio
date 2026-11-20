package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/** Small time based cache so that many open consoles cost the database one query per period. */
public final class TtlCache {
  static final int MAX_ENTRIES = 256;

  private record Entry(Object value, Instant expiresAt) {}

  private final Map<String, Entry> entries = new LinkedHashMap<>(16, 0.75f, true);
  // Fixed stripes bound coordination memory while coalescing same-key loads.
  private final Object[] loadLocks = new Object[32];
  private final Duration ttl;
  private final Clock clock;

  public TtlCache(Duration ttl, Clock clock) {
    this.ttl = ttl;
    this.clock = clock;
    java.util.Arrays.setAll(loadLocks, ignored -> new Object());
  }

  public <T> T get(String key, Supplier<T> loader) {
    if (ttl.isZero() || ttl.isNegative()) {
      return loader.get();
    }
    synchronized (loadLocks[Math.floorMod(key.hashCode(), loadLocks.length)]) {
      return getOrLoad(key, loader);
    }
  }

  @SuppressWarnings("unchecked")
  private <T> T getOrLoad(String key, Supplier<T> loader) {
    synchronized (entries) {
      Entry cached = entries.get(key);
      if (cached != null && clock.instant().isBefore(cached.expiresAt())) {
        return (T) cached.value();
      }
    }
    // Do not hold the cache lock while querying MongoDB for an unrelated key.
    T value = loader.get();
    synchronized (entries) {
      Instant now = clock.instant();
      entries.values().removeIf(entry -> !now.isBefore(entry.expiresAt()));
      if (!entries.containsKey(key) && entries.size() >= MAX_ENTRIES) {
        entries.remove(entries.keySet().iterator().next());
      }
      entries.put(key, new Entry(value, now.plus(ttl)));
    }
    return value;
  }

  int size() {
    synchronized (entries) {
      return entries.size();
    }
  }
}
