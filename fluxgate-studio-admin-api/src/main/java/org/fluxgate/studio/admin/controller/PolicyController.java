package org.fluxgate.studio.admin.controller;

import jakarta.validation.Valid;
import java.util.List;
import org.bson.Document;
import org.fluxgate.studio.admin.dto.request.PublishPolicyRequest;
import org.fluxgate.studio.admin.dto.request.RollbackPolicyRequest;
import org.fluxgate.studio.admin.service.PolicyPublicationService;
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

  public PolicyController(PolicyPublicationService service) {
    this.service = service;
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
  public Document publish(
      @PathVariable String id,
      @Valid @RequestBody PublishPolicyRequest request,
      Authentication authentication) {
    return service.publish(id, request, authentication.getName());
  }

  @PostMapping("/rollback")
  @PreAuthorize("hasRole('ADMIN')")
  public Document rollback(
      @PathVariable String id,
      @Valid @RequestBody RollbackPolicyRequest request,
      Authentication authentication) {
    return service.rollback(id, request, authentication.getName());
  }
}
