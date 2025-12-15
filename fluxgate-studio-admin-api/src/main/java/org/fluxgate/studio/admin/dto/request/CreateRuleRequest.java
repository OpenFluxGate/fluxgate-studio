package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;

/** Request DTO for creating a new rate limit rule. */
public record CreateRuleRequest(
    @NotBlank(message = "id is required")
        @Pattern(
            regexp = "^[a-zA-Z0-9-_]+$",
            message = "id must contain only alphanumeric characters, hyphens, and underscores")
        String id,
    @NotBlank(message = "name is required") String name,
    boolean enabled,
    @NotBlank(message = "scope is required")
        @Pattern(
            regexp = "^(GLOBAL|PER_API_KEY|PER_USER|PER_IP|CUSTOM)$",
            message = "scope must be one of: GLOBAL, PER_API_KEY, PER_USER, PER_IP, CUSTOM")
        String scope,
    @NotBlank(message = "keyStrategyId is required") String keyStrategyId,
    @NotBlank(message = "onLimitExceedPolicy is required")
        @Pattern(
            regexp = "^(REJECT_REQUEST|WAIT_FOR_REFILL)$",
            message = "onLimitExceedPolicy must be one of: REJECT_REQUEST, WAIT_FOR_REFILL")
        String onLimitExceedPolicy,
    @NotEmpty(message = "bands must not be empty") @Valid List<RateBandRequest> bands,
    String ruleSetId,
    List<String> tags,
    Map<String, Object> attributes) {}
