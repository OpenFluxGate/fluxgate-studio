package org.fluxgate.studio.admin.monitoring;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Supplier;

/** Small time based cache so that many open consoles cost the database one query per period. */
public final class TtlCache {
  static final int MAX_ENTRIES = 256;

  private record Entry(Object value, Instant expiresAt) {}

  private final Map<String, Entry> entries = new ConcurrentHashMap<>();
  private final Duration ttl;
  private final Clock clock;

  public TtlCache(Duration ttl, Clock clock) {
    this.ttl = ttl;
    this.clock = clock;
  }

  @SuppressWarnings("unchecked")
  public <T> T get(String key, Supplier<T> loader) {
    if (ttl.isZero() || ttl.isNegative()) {
      return loader.get();
    }
    Instant now = clock.instant();
    Entry cached = entries.get(key);
    if (cached != null && now.isBefore(cached.expiresAt())) {
      return (T) cached.value();
    }
    T value = loader.get();
    if (entries.size() >= MAX_ENTRIES) {
      entries.values().removeIf(entry -> !now.isBefore(entry.expiresAt()));
    }
    entries.put(key, new Entry(value, now.plus(ttl)));
    return value;
  }

  int size() {
    return entries.size();
  }
}
