package org.fluxgate.studio.admin.monitoring;

public record RejectedKeyResponse(
    String ruleSetId, String key, boolean masked, long rejected, long lastRejectedAt) {}
