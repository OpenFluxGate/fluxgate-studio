package org.fluxgate.studio.admin.controller;

import jakarta.validation.Valid;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.bson.Document;
import org.fluxgate.studio.admin.audit.AuditAction;
import org.fluxgate.studio.admin.audit.AuditService;
import org.fluxgate.studio.admin.audit.RuleDiff;
import org.fluxgate.studio.admin.dto.request.PublishPolicyRequest;
import org.fluxgate.studio.admin.dto.request.RollbackPolicyRequest;
import org.fluxgate.studio.admin.service.PolicyPublicationService;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/rule-sets/{id}")
public class PolicyController {
  private final PolicyPublicationService service;
  private final AuditService auditService;

  public PolicyController(PolicyPublicationService service, AuditService auditService) {
    this.service = service;
    this.auditService = auditService;
  }

  @GetMapping("/active")
  @PreAuthorize("hasAnyRole('USER','ADMIN')")
  public Document active(@PathVariable String id) {
    return service.active(id);
  }

  @GetMapping("/history")
  @PreAuthorize("hasAnyRole('USER','ADMIN')")
  public List<Document> history(
      @PathVariable String id, @RequestParam(defaultValue = "20") int limit) {
    return service.history(id, limit);
  }

  @PostMapping("/publish")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Document> publish(
      @PathVariable String id,
      @Valid @RequestBody PublishPolicyRequest request,
      Authentication authentication) {
    Document result = service.publish(id, request, authentication.getName());
    Map<String, Object> detail =
        policyDetail(request.operationId(), request.resetCounters(), result);
    detail.put("rules", request.rules().size());
    boolean audited =
        auditService.recordChange(
            authentication, AuditAction.POLICY_PUBLISH, RuleDiff.ruleSet(id), null, null, detail);
    return AuditService.flag(ResponseEntity.ok(), audited).body(result);
  }

  @PostMapping("/rollback")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Document> rollback(
      @PathVariable String id,
      @Valid @RequestBody RollbackPolicyRequest request,
      Authentication authentication) {
    Document result = service.rollback(id, request, authentication.getName());
    Map<String, Object> detail =
        policyDetail(request.operationId(), request.resetCounters(), result);
    detail.put("targetRevision", request.targetRevision());
    boolean audited =
        auditService.recordChange(
            authentication, AuditAction.POLICY_ROLLBACK, RuleDiff.ruleSet(id), null, null, detail);
    return AuditService.flag(ResponseEntity.ok(), audited).body(result);
  }

  private static Map<String, Object> policyDetail(
      String operationId, Boolean resetCounters, Document result) {
    Map<String, Object> detail = new LinkedHashMap<>();
    detail.put("operationId", operationId);
    detail.put("resetCounters", resetCounters);
    if (result != null && result.containsKey("revision")) {
      detail.put("revision", result.get("revision"));
    }
    return detail;
  }
}
