package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import org.fluxgate.studio.admin.audit.AuditActor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Session", description = "The signed in operator")
public class MeController {

  @GetMapping("/api/me")
  @PreAuthorize(Roles.READER)
  @Operation(summary = "Current operator", description = "Name and roles of the caller")
  public MeResponse me(Authentication authentication) {
    AuditActor actor = AuditActor.from(authentication);
    List<String> roles =
        authentication.getAuthorities().stream()
            .map(GrantedAuthority::getAuthority)
            .filter(authority -> authority.startsWith("ROLE_"))
            .map(authority -> authority.substring("ROLE_".length()))
            .sorted()
            .toList();
    return new MeResponse(actor.username(), actor.name(), roles, Roles.isAdmin(authentication));
  }
}
