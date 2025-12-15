import type { LimitExceedPolicy, RateBand, Rule, RuleScope, Stats } from '@/modules/admin/types';

import type { ApiDashboardStats, ApiRateBand, ApiRule } from './api';

export function mapApiRuleToRule(apiRule: ApiRule): Rule {
  return {
    id: apiRule.id,
    name: apiRule.name,
    enabled: apiRule.enabled,
    scope: apiRule.scope as RuleScope,
    keyStrategyId: apiRule.keyStrategyId,
    onLimitExceedPolicy: apiRule.onLimitExceedPolicy as LimitExceedPolicy,
    bands: apiRule.bands.map(mapApiRateBandToRateBand),
    ruleSetId: apiRule.ruleSetId,
    tags: apiRule.tags || [],
    attributes: apiRule.attributes || {},
  };
}

export function mapApiRateBandToRateBand(apiBand: ApiRateBand): RateBand {
  return {
    windowSeconds: apiBand.windowSeconds,
    capacity: apiBand.capacity,
    label: apiBand.label || '',
  };
}

export function mapApiStatsToStats(apiStats: ApiDashboardStats): Stats {
  return {
    totalRules: apiStats.totalRules,
    activeRules: apiStats.activeRules,
    disabledRules: apiStats.disabledRules,
    totalRuleSets: apiStats.totalRuleSets,
    lastUpdated: apiStats.lastUpdated,
  };
}

export function mapRuleToCreateRequest(rule: Partial<Rule> & { id: string }) {
  return {
    id: rule.id,
    name: rule.name || '',
    enabled: rule.enabled ?? true,
    scope: rule.scope || 'PER_IP',
    keyStrategyId: rule.keyStrategyId || 'ip',
    onLimitExceedPolicy: rule.onLimitExceedPolicy || 'REJECT_REQUEST',
    bands: rule.bands || [],
    ruleSetId: rule.ruleSetId || undefined,
    tags: rule.tags || [],
    attributes: rule.attributes || {},
  };
}

export function mapRuleToUpdateRequest(rule: Partial<Rule>) {
  return {
    name: rule.name || '',
    enabled: rule.enabled ?? true,
    scope: rule.scope || 'PER_IP',
    keyStrategyId: rule.keyStrategyId || 'ip',
    onLimitExceedPolicy: rule.onLimitExceedPolicy || 'REJECT_REQUEST',
    bands: rule.bands || [],
    ruleSetId: rule.ruleSetId || undefined,
    tags: rule.tags || [],
    attributes: rule.attributes || {},
  };
}
