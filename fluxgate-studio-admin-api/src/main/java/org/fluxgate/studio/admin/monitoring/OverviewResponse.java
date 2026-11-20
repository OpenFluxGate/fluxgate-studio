package org.fluxgate.studio.admin.monitoring;

import java.util.List;

public record OverviewResponse(
    String window,
    long from,
    long to,
    long total,
    long rejected,
    double rejectRate,
    List<RuleSetSummary> ruleSets) {}
