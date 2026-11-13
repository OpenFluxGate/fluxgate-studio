package org.fluxgate.studio.admin.monitoring;

public record KeyRuleSetStatus(
    String ruleSetId,
    KeyStatus status,
    long lastDecisionAt,
    boolean lastAllowed,
    long remainingTokens,
    Long blockedUntil,
    long allowed,
    long rejected) {}
