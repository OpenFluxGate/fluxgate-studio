package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.fluxgate.studio.admin.monitoring.KeyLookupRequest;
import org.fluxgate.studio.admin.monitoring.KeyLookupResponse;
import org.fluxgate.studio.admin.monitoring.KeyLookupService;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/keys")
@Tag(name = "Key lookup", description = "Decision history of one key, admin only and audited")
public class KeyLookupController {

  private final KeyLookupService keyLookupService;

  public KeyLookupController(KeyLookupService keyLookupService) {
    this.keyLookupService = keyLookupService;
  }

  @GetMapping("/transforms")
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "Key transforms", description = "How a typed key can be matched")
  public List<String> transforms() {
    return keyLookupService.transforms();
  }

  @PostMapping("/decisions")
  @PreAuthorize(Roles.WRITER)
  @Operation(
      summary = "Look up a key",
      description = "The lookup is recorded in the audit log before any data is read")
  public KeyLookupResponse lookup(
      @Valid @RequestBody KeyLookupRequest request, Authentication authentication) {
    return keyLookupService.lookup(request, authentication);
  }
}
