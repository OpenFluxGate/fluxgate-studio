package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.Arrays;
import java.util.stream.Collectors;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditEntry;
import org.fluxgate.studio.admin.audit.AuditQuery;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.dto.response.PageResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/audit")
@Tag(name = "Audit", description = "Who changed or looked up what, admin only")
public class AuditController {

  static final int MAX_PAGE_SIZE = 200;

  private final AuditService auditService;

  public AuditController(AuditService auditService) {
    this.auditService = auditService;
  }

  @GetMapping
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "Search the audit log", description = "Lookup values are masked here")
  public PageResponse<AuditEntry> search(
      @RequestParam(required = false) String action,
      @RequestParam(required = false) String actor,
      @RequestParam(required = false) String q,
      @RequestParam(required = false) Long from,
      @RequestParam(required = false) Long to,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    if (page < 0) {
      throw new InvalidRuleException("page", "must be 0 or greater");
    }
    if (size < 1 || size > MAX_PAGE_SIZE) {
      throw new InvalidRuleException("size", "must be between 1 and " + MAX_PAGE_SIZE);
    }
    return auditService.search(
        new AuditQuery(
            parseAction(action),
            blankToNull(actor),
            blankToNull(q),
            from == null ? null : Instant.ofEpochMilli(from),
            to == null ? null : Instant.ofEpochMilli(to),
            page,
            size));
  }

  @GetMapping("/{id}")
  @PreAuthorize(Roles.WRITER)
  @Operation(summary = "One audit entry", description = "Shows the lookup value unmasked")
  public ResponseEntity<AuditEntry> get(@PathVariable String id) {
    return ResponseEntity.of(auditService.find(id));
  }

  private static AuditAction parseAction(String action) {
    if (action == null || action.isBlank()) {
      return null;
    }
    try {
      return AuditAction.valueOf(action);
    } catch (IllegalArgumentException e) {
      throw new InvalidRuleException(
          "action",
          "must be one of: "
              + Arrays.stream(AuditAction.values())
                  .map(Enum::name)
                  .collect(Collectors.joining(", ")));
    }
  }

  private static String blankToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }
}
