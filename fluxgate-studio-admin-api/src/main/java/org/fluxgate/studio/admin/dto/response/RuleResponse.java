package org.fluxgate.studio.admin.dto.response;

import java.util.List;
import java.util.Map;

/**
 * Response DTO for rate limit rule.
 *
 * <p>{@code version} is the optimistic locking token. It must be echoed back on {@code PUT} either
 * in the request body or through the {@code If-Match} header.
 */
public record RuleResponse(
    String id,
    String name,
    boolean enabled,
    String scope,
    String keyStrategyId,
    String onLimitExceedPolicy,
    List<RateBandResponse> bands,
    String ruleSetId,
    List<String> tags,
    Map<String, Object> attributes,
    long version) {}
