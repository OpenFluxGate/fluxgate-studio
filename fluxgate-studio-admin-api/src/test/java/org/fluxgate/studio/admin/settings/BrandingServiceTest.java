package org.fluxgate.studio.admin.settings;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.Optional;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.request.UpdateBrandingRequest;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.exception.StorageConnectionException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.TestingAuthenticationToken;

class BrandingServiceTest {
  private static final Instant NOW = Instant.parse("2026-11-15T01:00:00Z");
  private static final String PNG = BrandingImagesTest.dataUrl("image/png", new byte[100]);

  private final MongoSettingsStore store = mock(MongoSettingsStore.class);
  private final AuditService audit = mock(AuditService.class);
  private final BrandingService service =
      new BrandingService(store, audit, Clock.fixed(NOW, ZoneOffset.UTC));
  private final TestingAuthenticationToken alice =
      new TestingAuthenticationToken("alice", "n/a", "ROLE_ADMIN");

  @Test
  void returnsTheDefaultsWhenNothingIsStored() {
    when(store.branding()).thenReturn(Optional.empty());

    assertThat(service.current()).isEqualTo(Branding.DEFAULT);
  }

  @Test
  void returnsTheDefaultsWhenStorageIsDown() {
    when(store.branding()).thenThrow(new StorageConnectionException("MongoDB", "down"));

    assertThat(service.current()).isEqualTo(Branding.DEFAULT);
  }

  @Test
  @SuppressWarnings("unchecked")
  void savesAndAuditsANewLogo() {
    when(store.branding()).thenReturn(Optional.empty());
    when(audit.recordChange(any(), any(), any(), any(), any(), any())).thenReturn(true);

    BrandingService.Saved saved = service.update(alice, new UpdateBrandingRequest(PNG, " "));

    assertThat(saved.audited()).isTrue();
    assertThat(saved.branding()).isEqualTo(new Branding(PNG, null, NOW.toEpochMilli(), "alice"));
    verify(store).saveBranding(saved.branding());
    ArgumentCaptor<Map<String, Object>> before = ArgumentCaptor.forClass(Map.class);
    ArgumentCaptor<Map<String, Object>> after = ArgumentCaptor.forClass(Map.class);
    verify(audit)
        .recordChange(
            eq(alice),
            eq(AuditAction.BRANDING_UPDATE),
            eq(Map.of("setting", "branding")),
            before.capture(),
            after.capture(),
            eq(null));
    assertThat(before.getValue()).containsEntry("logo", null).containsEntry("favicon", null);
    assertThat((String) after.getValue().get("logo")).startsWith("image/png, 0.1 KB");
    assertThat(after.getValue()).containsEntry("favicon", null);
  }

  @Test
  void describesAnUnreadableStoredImageInsteadOfFailing() {
    when(store.branding()).thenReturn(Optional.of(new Branding("broken", PNG, 1L, "bob")));

    BrandingService.Saved saved = service.update(alice, new UpdateBrandingRequest(null, null));

    assertThat(saved.branding().logo()).isNull();
    assertThat(saved.audited()).isFalse();
  }

  @Test
  void rejectsAnInvalidImageBeforeTouchingStorage() {
    assertThatThrownBy(() -> service.update(alice, new UpdateBrandingRequest("nope", null)))
        .isInstanceOf(InvalidRuleException.class);

    verify(store, never()).saveBranding(any());
  }
}
