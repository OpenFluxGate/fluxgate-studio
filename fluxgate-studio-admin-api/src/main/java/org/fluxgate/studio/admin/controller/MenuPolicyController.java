package org.fluxgate.studio.admin.controller;

import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.response.ErrorResponse;
import org.fluxgate.studio.admin.exception.MenuPolicyException;
import org.fluxgate.studio.admin.settings.MenuPolicy;
import org.fluxgate.studio.admin.settings.MenuPolicyService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/settings/menus")
@PreAuthorize(Roles.WRITER)
public class MenuPolicyController {

  private final MenuPolicyService policies;

  public MenuPolicyController(MenuPolicyService policies) {
    this.policies = policies;
  }

  @GetMapping
  public MenuPolicy current() {
    return policies.current();
  }

  @PutMapping
  public ResponseEntity<MenuPolicy> update(
      @RequestBody UpdateMenuPolicy request, Authentication authentication) {
    MenuPolicy requested;
    try {
      JsonNode version = request.version();
      if (version == null || !version.isIntegralNumber() || !version.canConvertToLong()) {
        throw new IllegalArgumentException("Menu policy version must be an integer");
      }
      requested = new MenuPolicy(version.longValue(), request.admin(), request.user());
    } catch (IllegalArgumentException e) {
      throw new MenuPolicyException(HttpStatus.BAD_REQUEST, e.getMessage());
    }
    MenuPolicyService.Saved saved = policies.update(authentication, requested);
    return AuditService.flag(ResponseEntity.ok(), saved.auditPublished()).body(saved.policy());
  }

  @ExceptionHandler(HttpMessageNotReadableException.class)
  public ResponseEntity<ErrorResponse> malformed(HttpServletRequest request) {
    return ResponseEntity.badRequest()
        .body(
            new ErrorResponse(400, "Bad Request", "Invalid menu policy", request.getRequestURI()));
  }

  public record UpdateMenuPolicy(
      @Schema(type = "integer", format = "int64") JsonNode version,
      List<String> admin,
      List<String> user) {}
}
