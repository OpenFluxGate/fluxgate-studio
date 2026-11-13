package org.fluxgate.studio.admin.monitoring;

public record RejectedKey(String ruleSetId, String key, long rejected, long lastRejectedAt) {}
