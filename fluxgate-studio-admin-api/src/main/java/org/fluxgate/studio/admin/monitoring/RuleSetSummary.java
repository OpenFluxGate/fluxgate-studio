package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record RuleSetSummary(
    String ruleSetId,
    long total,
    long rejected,
    double rejectRate,
    Long lastDecisionAt,
    List<Long> trend) {}
