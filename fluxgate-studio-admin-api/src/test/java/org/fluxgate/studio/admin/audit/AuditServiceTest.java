package org.fluxgate.studio.admin.audit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.TestingAuthenticationToken;

class AuditServiceTest {
  private static final Instant NOW = Instant.parse("2026-11-14T05:00:00Z");

  private final MongoAuditStore store = mock(MongoAuditStore.class);
  private final AuditService service = new AuditService(store, Clock.fixed(NOW, ZoneOffset.UTC));
  private final TestingAuthenticationToken alice =
      new TestingAuthenticationToken("alice", "n/a", "ROLE_ADMIN");

  @Test
  void recordsAChangeWithTheCallerAndTime() {
    assertThat(
            service.recordChange(
                alice, AuditAction.RULE_UPDATE, Map.of("ruleId", "r"), Map.of(), Map.of(), null))
        .isTrue();

    ArgumentCaptor<AuditEntry> captor = ArgumentCaptor.forClass(AuditEntry.class);
    verify(store).insert(captor.capture());
    assertThat(captor.getValue().at()).isEqualTo(NOW);
    assertThat(captor.getValue().actor().username()).isEqualTo("alice");
  }

  @Test
  void reportsAFailedChangeRecordWithoutThrowing() {
    doThrow(new IllegalStateException("down")).when(store).insert(any());

    assertThat(service.recordChange(alice, AuditAction.RULE_DELETE, null, null, null, null))
        .isFalse();
  }

  @Test
  void refusesALookupThatCannotBeRecorded() {
    doThrow(new IllegalStateException("down")).when(store).insert(any());

    assertThatThrownBy(() -> service.recordKeyLookup(alice, "123456789", "none", "24h"))
        .isInstanceOf(StorageConnectionException.class);
  }

  @Test
  void masksLookupValuesInSearchResultsOnly() {
    AuditEntry lookup =
        new AuditEntry(
            "1",
            NOW,
            new AuditActor(null, "alice", "alice"),
            AuditAction.KEY_LOOKUP,
            null,
            null,
            null,
            Map.of("value", "123456789", "transform", "none"));
    when(store.search(any())).thenReturn(new PageResponse<>(List.of(lookup), 0, 10, 1));

    AuditEntry listed =
        service.search(new AuditQuery(null, null, null, null, null, 0, 10)).content().get(0);

    assertThat(listed.detail()).containsEntry("value", "12****89");
    assertThat(AuditService.masked(listed)).isEqualTo(listed);
  }

  @Test
  void flagsResponsesWhoseAuditFailed() {
    assertThat(AuditService.flag(ResponseEntity.ok(), false).build().getHeaders())
        .containsEntry(AuditService.HEADER, List.of("failed"));
    assertThat(AuditService.flag(ResponseEntity.ok(), true).build().getHeaders())
        .doesNotContainKey(AuditService.HEADER);
  }
}
