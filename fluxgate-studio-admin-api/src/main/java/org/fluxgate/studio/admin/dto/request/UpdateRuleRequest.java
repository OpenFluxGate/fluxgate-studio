package org.fluxgate.studio.admin.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.Map;
import org.fluxgate.core.config.LimitScope;
import org.fluxgate.core.config.OnLimitExceedPolicy;
import org.fluxgate.studio.admin.validation.EnumValue;

/**
 * Request DTO for updating an existing rate limit rule.
 *
 * <p>{@link #version()} carries the optimistic locking token returned by the previous read. It may
 * be omitted when the {@code If-Match} request header is used instead.
 */
public record UpdateRuleRequest(
    @NotBlank(message = "name is required") String name,
    boolean enabled,
    @NotBlank(message = "scope is required") @EnumValue(enumClass = LimitScope.class) String scope,
    @NotBlank(message = "keyStrategyId is required") String keyStrategyId,
    @NotBlank(message = "onLimitExceedPolicy is required")
        @EnumValue(enumClass = OnLimitExceedPolicy.class)
        String onLimitExceedPolicy,
    @NotEmpty(message = "bands must not be empty") @Valid List<RateBandRequest> bands,
    String ruleSetId,
    List<String> tags,
    Map<String, Object> attributes,
    @Min(value = 0, message = "version must not be negative") Long version) {}
