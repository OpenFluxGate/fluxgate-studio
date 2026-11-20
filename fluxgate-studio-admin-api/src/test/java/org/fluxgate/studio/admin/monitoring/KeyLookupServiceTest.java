package org.fluxgate.studio.admin.monitoring;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.authentication.TestingAuthenticationToken;

class KeyLookupServiceTest {
  private static final long NOW = 1_794_600_000_000L;
  private static final long DAY = 86_400_000L;

  private final MongoEventStore store = mock(MongoEventStore.class);
  private final AuditService audit = mock(AuditService.class);
  private final TestingAuthenticationToken admin =
      new TestingAuthenticationToken("alice", "n/a", "ROLE_ADMIN");
  private KeyLookupService service;

  @BeforeEach
  void setUp() {
    service =
        new KeyLookupService(
            store,
            audit,
            new MonitoringProperties(
                "",
                "rate_limit_events",
                true,
                Duration.ofSeconds(10),
                Duration.ofSeconds(5),
                List.of("none", "sha256")),
            Clock.fixed(Instant.ofEpochMilli(NOW), ZoneOffset.UTC));
    when(store.buckets(anyLong(), anyLong(), anyLong(), any(), anyString())).thenReturn(List.of());
    when(store.recentDecisions(anyString(), anyLong(), anyLong(), eq(100))).thenReturn(List.of());
  }

  private static KeyDecision decision(String ruleSetId, long at, boolean allowed, long retryAfter) {
    return new KeyDecision(
        at, ruleSetId, ruleSetId + "-rule", "/api/x", "POST", allowed, 4, retryAfter);
  }

  @Test
  void recordsTheLookupBeforeReadingHistory() {
    when(store.activityByRuleSet(NOW - DAY, NOW, "123456789"))
        .thenReturn(List.of(new RuleSetActivity("a", 5, 1, NOW - 1_000)));
    when(store.lastDecisionByRuleSet("123456789", NOW - DAY, NOW))
        .thenReturn(Map.of("a", decision("a", NOW - 1_000, false, 5_000)));

    KeyLookupResponse response =
        service.lookup(new KeyLookupRequest(" 123456789 ", "none", "24h"), admin);

    InOrder order = inOrder(audit, store);
    order.verify(audit).recordKeyLookup(admin, "123456789", "none", "24h");
    order.verify(store).lastDecisionByRuleSet("123456789", NOW - DAY, NOW);
    assertThat(response.key()).isEqualTo("123456789");
    assertThat(response.bucketMillis()).isEqualTo(900_000L);
    assertThat(response.buckets()).hasSize(96);
    assertThat(response.ruleSets())
        .containsExactly(
            new KeyRuleSetStatus("a", KeyStatus.BLOCKED, NOW - 1_000, false, 4, NOW + 4_000, 4, 1));
  }

  @Test
  void looksUpTheHashedKeyButAuditsTheInput() {
    service.lookup(new KeyLookupRequest("abc", "sha256", "1h"), admin);

    String hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    verify(audit).recordKeyLookup(admin, "abc", "sha256", "1h");
    verify(store).activityByRuleSet(NOW - 3_600_000L, NOW, hash);
  }

  @Test
  void doesNotQueryWhenTheLookupCannotBeAudited() {
    doThrow(new StorageConnectionException("Audit log", "down"))
        .when(audit)
        .recordKeyLookup(any(), anyString(), anyString(), anyString());

    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "none", "1h"), admin))
        .isInstanceOf(StorageConnectionException.class);
    verifyNoInteractions(store);
  }

  @Test
  void rejectsInvalidInputBeforeAuditing() {
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "none", "5m"), admin))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("u1", "md5", "1h"), admin))
        .isInstanceOf(InvalidRuleException.class);
    assertThatThrownBy(() -> service.lookup(new KeyLookupRequest("   ", "none", "1h"), admin))
        .isInstanceOf(InvalidRuleException.class);
    verify(audit, never()).recordKeyLookup(any(), anyString(), anyString(), anyString());
  }

  @Test
  void derivesTheStatusFromTheLastDecision() {
    RuleSetActivity activity = new RuleSetActivity("a", 3, 1, NOW - 10_000);

    assertThat(
            KeyLookupService.status(activity, decision("a", NOW - 10_000, true, 0), NOW).status())
        .isEqualTo(KeyStatus.ALLOWED);
    assertThat(
            KeyLookupService.status(activity, decision("a", NOW - 10_000, false, 20_000), NOW)
                .status())
        .isEqualTo(KeyStatus.BLOCKED);
    assertThat(
            KeyLookupService.status(activity, decision("a", NOW - 10_000, false, 5_000), NOW)
                .status())
        .isEqualTo(KeyStatus.RECOVERED);
    assertThat(KeyLookupService.status(activity, decision("a", NOW, true, 0), NOW).blockedUntil())
        .isNull();
  }

  @Test
  void listsTheEnabledTransforms() {
    assertThat(service.transforms()).containsExactly("none", "sha256");
  }
}
