package org.fluxgate.studio.admin.config;

import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import java.time.Duration;
import java.util.List;
import org.fluxgate.studio.admin.audit.MongoAuditStore;
import org.fluxgate.studio.admin.monitoring.MongoEventStore;
import org.fluxgate.studio.admin.monitoring.MonitoringProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;

class MonitoringConfigTest {
  private final MonitoringConfig config = new MonitoringConfig();

  private static MonitoringProperties properties(boolean createIndexes) {
    return new MonitoringProperties(
        "",
        "rate_limit_events",
        createIndexes,
        Duration.ofSeconds(10),
        Duration.ofSeconds(5),
        List.of("none", "sha256"));
  }

  @Test
  void skipsEventIndexesWhenDisabled() throws Exception {
    MongoEventStore events = mock(MongoEventStore.class);
    MongoAuditStore audit = mock(MongoAuditStore.class);

    config
        .monitoringIndexes(events, audit, properties(false))
        .run(new DefaultApplicationArguments());

    verify(events, never()).ensureIndexes();
    verify(audit).ensureIndexes();
  }

  @Test
  void keepsStartingWhenIndexCreationFails() throws Exception {
    MongoEventStore events = mock(MongoEventStore.class);
    MongoAuditStore audit = mock(MongoAuditStore.class);
    doThrow(new IllegalStateException("not authorized")).when(events).ensureIndexes();
    doThrow(new IllegalStateException("not authorized")).when(audit).ensureIndexes();

    config
        .monitoringIndexes(events, audit, properties(true))
        .run(new DefaultApplicationArguments());

    verify(events).ensureIndexes();
    verify(audit).ensureIndexes();
  }
}
