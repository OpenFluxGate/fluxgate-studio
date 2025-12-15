package org.fluxgate.studio.admin.dto.response;

/** Response DTO for dashboard statistics. */
public record DashboardStatsResponse(
    long totalRules,
    long activeRules,
    long disabledRules,
    long totalRuleSets,
    String lastUpdated) {}
