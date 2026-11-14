package org.fluxgate.studio.admin.settings;

import java.time.Clock;
import java.util.LinkedHashMap;
import java.util.Map;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.request.UpdateBrandingRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;

/** Reads and changes the console logo and favicon. */
@Service
public class BrandingService {

  static final int MAX_LOGO_BYTES = 128 * 1024;
  static final int MAX_FAVICON_BYTES = 64 * 1024;

  private static final Logger log = LoggerFactory.getLogger(BrandingService.class);

  private final MongoSettingsStore store;
  private final AuditService auditService;
  private final Clock clock;

  public BrandingService(MongoSettingsStore store, AuditService auditService, Clock clock) {
    this.store = store;
    this.auditService = auditService;
    this.clock = clock;
  }

  /** Current branding. The defaults are returned when storage cannot be read. */
  public Branding current() {
    try {
      return store.branding().orElse(Branding.DEFAULT);
    } catch (RuntimeException e) {
      log.warn("Branding could not be read, the defaults are shown. Reason: {}", e.getMessage());
      return Branding.DEFAULT;
    }
  }

  /** Replaces both images. A blank or missing image restores the default. */
  public Saved update(Authentication authentication, UpdateBrandingRequest request) {
    String logo = blankToNull(request.logo());
    String favicon = blankToNull(request.favicon());
    Map<String, Object> after = new LinkedHashMap<>();
    after.put("logo", logo == null ? null : BrandingImages.describe("logo", logo, MAX_LOGO_BYTES));
    after.put(
        "favicon",
        favicon == null ? null : BrandingImages.describe("favicon", favicon, MAX_FAVICON_BYTES));

    Branding previous = store.branding().orElse(Branding.DEFAULT);
    Branding next =
        new Branding(logo, favicon, clock.millis(), AuditActor.from(authentication).username());
    store.saveBranding(next);

    boolean audited =
        auditService.recordChange(
            authentication,
            AuditAction.BRANDING_UPDATE,
            Map.of("setting", "branding"),
            describe(previous),
            after,
            null);
    return new Saved(next, audited);
  }

  private static Map<String, Object> describe(Branding branding) {
    Map<String, Object> map = new LinkedHashMap<>();
    map.put("logo", safeDescribe("logo", branding.logo(), MAX_LOGO_BYTES));
    map.put("favicon", safeDescribe("favicon", branding.favicon(), MAX_FAVICON_BYTES));
    return map;
  }

  private static String safeDescribe(String field, String value, int maxBytes) {
    if (value == null) {
      return null;
    }
    try {
      return BrandingImages.describe(field, value, maxBytes);
    } catch (RuntimeException e) {
      return "unreadable";
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value.trim();
  }

  /** Saved branding and whether its audit record was stored. */
  public record Saved(Branding branding, boolean audited) {}
}
