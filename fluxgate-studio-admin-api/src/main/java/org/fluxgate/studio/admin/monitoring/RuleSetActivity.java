package org.fluxgate.studio.admin.monitoring;

public record RuleSetActivity(String ruleSetId, long total, long rejected, long lastDecisionAt) {}
