package org.fluxgate.studio.admin.monitoring;

public record KeyDecision(
    long timestamp,
    String ruleSetId,
    String ruleId,
    String endpoint,
    String method,
    boolean allowed,
    long remainingTokens,
    long retryAfterMs) {}
