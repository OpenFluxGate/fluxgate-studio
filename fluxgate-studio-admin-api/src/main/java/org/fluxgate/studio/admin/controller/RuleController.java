package org.fluxgate.studio.admin.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import java.util.Map;
import org.fluxgate.studio.admin.dto.request.CreateRuleRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.service.RuleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** REST controller for rate limit rule management. */
@RestController
@RequestMapping("/api/rules")
@Tag(name = "Rules", description = "Rate limit rule management APIs")
public class RuleController {

  private static final Logger log = LoggerFactory.getLogger(RuleController.class);

  private final RuleService ruleService;

  public RuleController(RuleService ruleService) {
    this.ruleService = ruleService;
  }

  @GetMapping
  @Operation(summary = "List rules", description = "Get all rules or filter by ruleSetId")
  @ApiResponses({@ApiResponse(responseCode = "200", description = "Rules retrieved successfully")})
  public ResponseEntity<List<RuleResponse>> listRules(
      @Parameter(description = "Filter by rule set ID") @RequestParam(required = false)
          String ruleSetId) {
    log.debug("GET /api/rules - ruleSetId={}", ruleSetId);
    List<RuleResponse> rules;
    if (ruleSetId != null && !ruleSetId.isEmpty()) {
      rules = ruleService.getRulesByRuleSetId(ruleSetId);
    } else {
      rules = ruleService.getAllRules();
    }
    return ResponseEntity.ok(rules);
  }

  @GetMapping("/{id}")
  @Operation(summary = "Get rule by ID", description = "Get a specific rule by its ID")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule retrieved successfully"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<RuleResponse> getRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id) {
    log.debug("GET /api/rules/{}", id);
    return ResponseEntity.ok(ruleService.getRuleById(id));
  }

  @PostMapping
  @Operation(summary = "Create rule", description = "Create a new rate limit rule")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Rule created successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "409", description = "Rule already exists")
  })
  public ResponseEntity<RuleResponse> createRule(@Valid @RequestBody CreateRuleRequest request) {
    log.debug("POST /api/rules - id={}", request.id());
    RuleResponse created = ruleService.createRule(request);
    return ResponseEntity.status(HttpStatus.CREATED).body(created);
  }

  @PutMapping("/{id}")
  @Operation(summary = "Update rule", description = "Update an existing rate limit rule")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule updated successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<RuleResponse> updateRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @Valid @RequestBody UpdateRuleRequest request) {
    log.debug("PUT /api/rules/{}", id);
    return ResponseEntity.ok(ruleService.updateRule(id, request));
  }

  @DeleteMapping("/{id}")
  @Operation(summary = "Delete rule", description = "Delete a rate limit rule by ID")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Rule deleted successfully"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<Void> deleteRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id) {
    log.debug("DELETE /api/rules/{}", id);
    ruleService.deleteRule(id);
    return ResponseEntity.noContent().build();
  }

  @PatchMapping("/{id}/toggle")
  @Operation(summary = "Toggle rule", description = "Toggle rule enabled/disabled status")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule toggled successfully"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<RuleResponse> toggleRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id) {
    log.debug("PATCH /api/rules/{}/toggle", id);
    return ResponseEntity.ok(ruleService.toggleRule(id));
  }

  @DeleteMapping
  @Operation(summary = "Delete rules by ruleSetId", description = "Delete all rules in a rule set")
  @ApiResponses({@ApiResponse(responseCode = "200", description = "Rules deleted successfully")})
  public ResponseEntity<Map<String, Object>> deleteByRuleSetId(
      @Parameter(description = "Rule set ID", required = true) @RequestParam String ruleSetId) {
    log.debug("DELETE /api/rules?ruleSetId={}", ruleSetId);
    int count = ruleService.deleteByRuleSetId(ruleSetId);
    return ResponseEntity.ok(
        Map.of(
            "message", "Rules deleted successfully",
            "ruleSetId", ruleSetId,
            "deletedCount", count));
  }
}
