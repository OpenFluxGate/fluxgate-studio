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
import org.fluxgate.studio.admin.dto.request.ImportRulesRequest;
import org.fluxgate.studio.admin.dto.request.SimulateRequest;
import org.fluxgate.studio.admin.dto.request.UpdateRuleRequest;
import org.fluxgate.studio.admin.dto.response.ImportResultResponse;
import org.fluxgate.studio.admin.dto.response.RuleResponse;
import org.fluxgate.studio.admin.dto.response.SimulationResponse;
import org.fluxgate.studio.admin.exception.InvalidRuleException;
import org.fluxgate.studio.admin.service.RuleService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST controller for rate limit rule management.
 *
 * <p>Reads are open to {@code ROLE_USER} and {@code ROLE_ADMIN}; every mutating endpoint requires
 * {@code ROLE_ADMIN}. The rules are declared here with {@code @PreAuthorize} and mirrored in the
 * {@link org.fluxgate.studio.admin.config.SecurityConfig} request matchers.
 */
@RestController
@RequestMapping("/api/rules")
@Tag(name = "Rules", description = "Rate limit rule management APIs")
public class RuleController {

  private static final Logger log = LoggerFactory.getLogger(RuleController.class);

  private static final String ROLE_READER = "hasAnyRole('USER', 'ADMIN')";
  private static final String ROLE_WRITER = "hasRole('ADMIN')";

  private final RuleService ruleService;

  public RuleController(RuleService ruleService) {
    this.ruleService = ruleService;
  }

  /**
   * List rules, optionally filtered by rule set and optionally paged.
   *
   * <p>Backward compatible by design: when neither {@code page} nor {@code size} is supplied the
   * response is the plain JSON array it has always been. As soon as one of them is present the
   * response becomes a page envelope {@code {content, page, size, totalElements}}.
   *
   * @param ruleSetId optional rule set filter
   * @param page zero based page index, defaults to 0 when only {@code size} is given
   * @param size page size, defaults to {@value RuleService#DEFAULT_PAGE_SIZE}, maximum {@value
   *     RuleService#MAX_PAGE_SIZE}
   * @return the rule list or the page envelope
   */
  @GetMapping
  @PreAuthorize(ROLE_READER)
  @Operation(
      summary = "List rules",
      description =
          "Get all rules or filter by ruleSetId. Supply page and/or size to receive a page"
              + " envelope {content, page, size, totalElements}; without them the plain list is"
              + " returned for backward compatibility.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rules retrieved successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid paging parameters")
  })
  public ResponseEntity<Object> listRules(
      @Parameter(description = "Filter by rule set ID") @RequestParam(required = false)
          String ruleSetId,
      @Parameter(description = "Zero based page index") @RequestParam(required = false)
          Integer page,
      @Parameter(description = "Page size (max 200)") @RequestParam(required = false)
          Integer size) {
    log.debug("GET /api/rules - ruleSetId={}, page={}, size={}", ruleSetId, page, size);

    if (page != null || size != null) {
      return ResponseEntity.ok(
          ruleService.getRulesPage(
              ruleSetId,
              page != null ? page : 0,
              size != null ? size : RuleService.DEFAULT_PAGE_SIZE));
    }

    List<RuleResponse> rules;
    if (ruleSetId != null && !ruleSetId.isEmpty()) {
      rules = ruleService.getRulesByRuleSetId(ruleSetId);
    } else {
      rules = ruleService.getAllRules();
    }
    return ResponseEntity.ok(rules);
  }

  @GetMapping("/export")
  @PreAuthorize(ROLE_READER)
  @Operation(
      summary = "Export rules",
      description = "Download every rule as a JSON array suitable for POST /api/rules/import")
  @ApiResponses({@ApiResponse(responseCode = "200", description = "Rules exported successfully")})
  public ResponseEntity<List<RuleResponse>> exportRules() {
    log.debug("GET /api/rules/export");
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"fluxgate-rules.json\"")
        .contentType(MediaType.APPLICATION_JSON)
        .body(ruleService.getAllRules());
  }

  @PostMapping("/import")
  @PreAuthorize(ROLE_WRITER)
  @Operation(
      summary = "Import rules",
      description =
          "Upsert a batch of rules. Every entry is validated before anything is written. "
              + "At most 500 rules per request.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rules imported successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "403", description = "Admin role required")
  })
  public ResponseEntity<ImportResultResponse> importRules(
      @Valid @RequestBody ImportRulesRequest request) {
    log.debug("POST /api/rules/import - {} rules", request.rules().size());
    return ResponseEntity.ok(ruleService.importRules(request.rules()));
  }

  @GetMapping("/{id}")
  @PreAuthorize(ROLE_READER)
  @Operation(summary = "Get rule by ID", description = "Get a specific rule by its ID")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule retrieved successfully"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<RuleResponse> getRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(required = false) String unassigned) {
    log.debug("GET /api/rules/{}", id);
    return ResponseEntity.ok(
        scoped(ruleSetId, unassigned)
            ? ruleService.getRuleById(ruleSetId, id)
            : ruleService.getRuleById(id));
  }

  @PostMapping("/{id}/simulate")
  @PreAuthorize(ROLE_READER)
  @Operation(
      summary = "Simulate rule",
      description =
          "Read-only dry-run: computes the per band allow/deny outcome for a burst of requests"
              + " spread over a time window. Pure arithmetic on the rule bands, no bucket state is"
              + " read or written.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Simulation completed"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<SimulationResponse> simulateRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @Valid @RequestBody SimulateRequest request,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(required = false) String unassigned) {
    log.debug("POST /api/rules/{}/simulate", id);
    return ResponseEntity.ok(
        scoped(ruleSetId, unassigned)
            ? ruleService.simulate(ruleSetId, id, request)
            : ruleService.simulate(id, request));
  }

  @PostMapping
  @PreAuthorize(ROLE_WRITER)
  @Operation(summary = "Create rule", description = "Create a new rate limit rule")
  @ApiResponses({
    @ApiResponse(responseCode = "201", description = "Rule created successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid request"),
    @ApiResponse(responseCode = "403", description = "Admin role required"),
    @ApiResponse(responseCode = "409", description = "Rule already exists")
  })
  public ResponseEntity<RuleResponse> createRule(@Valid @RequestBody CreateRuleRequest request) {
    log.debug("POST /api/rules - id={}", request.id());
    RuleResponse created = ruleService.createRule(request);
    return ResponseEntity.status(HttpStatus.CREATED).body(created);
  }

  /**
   * Update an existing rule.
   *
   * @param id the rule ID
   * @param ifMatch optimistic locking token, an alternative to {@code version} in the body
   * @param request the update request
   * @return the updated rule
   */
  @PutMapping("/{id}")
  @PreAuthorize(ROLE_WRITER)
  @Operation(
      summary = "Update rule",
      description =
          "Update an existing rate limit rule. The optimistic locking token must be supplied"
              + " either as the version body field or as an If-Match header; a stale token yields"
              + " 409.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule updated successfully"),
    @ApiResponse(responseCode = "400", description = "Invalid request or missing version"),
    @ApiResponse(responseCode = "403", description = "Admin role required"),
    @ApiResponse(responseCode = "404", description = "Rule not found"),
    @ApiResponse(responseCode = "409", description = "Rule was modified concurrently")
  })
  public ResponseEntity<RuleResponse> updateRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @Parameter(description = "Expected rule version, optionally quoted as an ETag")
          @RequestHeader(value = HttpHeaders.IF_MATCH, required = false)
          String ifMatch,
      @Valid @RequestBody UpdateRuleRequest request,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(required = false) String unassigned) {
    log.debug("PUT /api/rules/{} - ifMatch={}", id, ifMatch);
    RuleResponse updated =
        scoped(ruleSetId, unassigned)
            ? ruleService.updateRule(ruleSetId, id, request, parseIfMatch(ifMatch))
            : ruleService.updateRule(id, request, parseIfMatch(ifMatch));
    return ResponseEntity.ok().eTag(String.valueOf(updated.version())).body(updated);
  }

  /**
   * Parses the {@code If-Match} header into a rule version.
   *
   * <p>Accepts both the bare number and the quoted ETag form returned by this API ({@code "7"} or
   * {@code W/"7"}).
   *
   * @param ifMatch the raw header value, may be {@code null}
   * @return the parsed version, or {@code null} when the header is absent
   * @throws InvalidRuleException if the header is present but not a version
   */
  private static Long parseIfMatch(String ifMatch) {
    if (ifMatch == null || ifMatch.isBlank()) {
      return null;
    }
    String value = ifMatch.trim();
    if (value.startsWith("W/")) {
      value = value.substring(2);
    }
    value = value.replace("\"", "").trim();
    try {
      return Long.valueOf(value);
    } catch (NumberFormatException e) {
      throw new InvalidRuleException("If-Match", "must be a rule version, was: " + ifMatch);
    }
  }

  @DeleteMapping("/{id}")
  @PreAuthorize(ROLE_WRITER)
  @Operation(summary = "Delete rule", description = "Delete a rate limit rule by ID")
  @ApiResponses({
    @ApiResponse(responseCode = "204", description = "Rule deleted successfully"),
    @ApiResponse(responseCode = "403", description = "Admin role required"),
    @ApiResponse(responseCode = "404", description = "Rule not found")
  })
  public ResponseEntity<Void> deleteRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(required = false) String unassigned) {
    log.debug("DELETE /api/rules/{}", id);
    if (scoped(ruleSetId, unassigned)) ruleService.deleteRule(ruleSetId, id);
    else ruleService.deleteRule(id);
    return ResponseEntity.noContent().build();
  }

  @PatchMapping("/{id}/toggle")
  @PreAuthorize(ROLE_WRITER)
  @Operation(
      summary = "Toggle rule",
      description =
          "Toggle rule enabled/disabled status. Written with the same compare-and-set as PUT, so a"
              + " concurrent edit is answered with 409 instead of overwriting it.")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rule toggled successfully"),
    @ApiResponse(responseCode = "403", description = "Admin role required"),
    @ApiResponse(responseCode = "404", description = "Rule not found"),
    @ApiResponse(responseCode = "409", description = "Rule was modified concurrently")
  })
  public ResponseEntity<RuleResponse> toggleRule(
      @Parameter(description = "Rule ID", required = true) @PathVariable String id,
      @RequestParam(required = false) String ruleSetId,
      @RequestParam(required = false) String unassigned) {
    log.debug("PATCH /api/rules/{}/toggle", id);
    return ResponseEntity.ok(
        scoped(ruleSetId, unassigned)
            ? ruleService.toggleRule(ruleSetId, id)
            : ruleService.toggleRule(id));
  }

  @DeleteMapping
  @PreAuthorize(ROLE_WRITER)
  @Operation(summary = "Delete rules by ruleSetId", description = "Delete all rules in a rule set")
  @ApiResponses({
    @ApiResponse(responseCode = "200", description = "Rules deleted successfully"),
    @ApiResponse(responseCode = "403", description = "Admin role required")
  })
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

  private boolean scoped(String ruleSetId, String unassigned) {
    if (ruleSetId != null && ruleSetId.isBlank()) {
      throw new InvalidRuleException("ruleSetId", "must not be empty");
    }
    if (unassigned != null && (!"true".equals(unassigned) || ruleSetId != null)) {
      throw new InvalidRuleException(
          "unassigned", "must be true and mutually exclusive with ruleSetId");
    }
    return ruleSetId != null || "true".equals(unassigned);
  }
}
