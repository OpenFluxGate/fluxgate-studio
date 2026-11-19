package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.request.UpdateBrandingRequest;
import org.fluxgate.studio.admin.settings.Branding;
import org.fluxgate.studio.admin.settings.BrandingService;
import org.fluxgate.studio.admin.settings.MenuPolicy;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/branding")
@Tag(name = "Branding", description = "Console logo and favicon")
public class BrandingController {

  private final BrandingService brandingService;

  public BrandingController(BrandingService brandingService) {
    this.brandingService = brandingService;
  }

  @GetMapping
  @Operation(
      summary = "Current logo and favicon",
      description = "Public, because the sign in page and the browser tab need it")
  public ResponseEntity<Branding> get() {
    return ResponseEntity.ok().cacheControl(CacheControl.noCache()).body(brandingService.current());
  }

  @MenuAccess(MenuPolicy.SETTINGS)
  @PutMapping
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "Replace the logo and favicon", description = "Admin only and audited")
  public ResponseEntity<Branding> update(
      @RequestBody UpdateBrandingRequest request, Authentication authentication) {
    BrandingService.Saved saved = brandingService.update(authentication, request);
    return AuditService.flag(ResponseEntity.ok(), saved.audited()).body(saved.branding());
  }
}
