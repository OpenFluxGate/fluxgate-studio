package org.fluxgate.studio.admin.repository;

/** Aggregated rule counters used by the dashboard. */
public record RuleStatistics(
    long totalRules, long activeRules, long disabledRules, long totalRuleSets) {}
