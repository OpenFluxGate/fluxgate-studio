package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import java.util.List;
import java.util.Map;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.studio.admin.validation.EnumValue;

/** Request DTO for creating a new rate limit rule. */
public record CreateRuleRequest(
    @NotBlank(message = "id is required")
        @Pattern(
            regexp = "^[a-zA-Z0-9-_]+$",
            message = "id must contain only alphanumeric characters, hyphens, and underscores")
        String id,
    @NotBlank(message = "name is required") String name,
    boolean enabled,
    @NotBlank(message = "scope is required") @EnumValue(enumClass = LimitScope.class) String scope,
    @NotBlank(message = "keyStrategyId is required") String keyStrategyId,
    @NotBlank(message = "onLimitExceedPolicy is required")
        @EnumValue(enumClass = OnLimitExceedPolicy.class)
        String onLimitExceedPolicy,
    @NotEmpty(message = "bands must not be empty") @Valid List<RateBandRequest> bands,
    @Pattern(regexp = "(?s).*\\S.*", message = "must not be blank") String ruleSetId,
    List<String> tags,
    Map<String, Object> attributes) {}
