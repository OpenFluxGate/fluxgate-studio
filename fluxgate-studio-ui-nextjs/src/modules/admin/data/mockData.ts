import { type Rule, type Stats } from '../types';

export const mockRules: Rule[] = [
  {
    id: 'api-limits',
    name: 'Public API Limits',
    enabled: true,
    scope: 'PER_IP',
    keyStrategyId: 'ip',
    onLimitExceedPolicy: 'REJECT_REQUEST',
    bands: [
      { windowSeconds: 1, capacity: 10, label: '10-per-second' },
      { windowSeconds: 60, capacity: 100, label: '100-per-minute' },
      { windowSeconds: 3600, capacity: 1000, label: '1000-per-hour' },
    ],
    tags: ['public-api', 'v1'],
    ruleSetId: 'production',
    attributes: {},
  },
  {
    id: 'auth-limits',
    name: 'Authentication Rate Limit',
    enabled: true,
    scope: 'PER_IP',
    keyStrategyId: 'ip',
    onLimitExceedPolicy: 'REJECT_REQUEST',
    bands: [
      { windowSeconds: 60, capacity: 5, label: '5-per-minute' },
      { windowSeconds: 3600, capacity: 20, label: '20-per-hour' },
    ],
    tags: ['auth', 'security'],
    ruleSetId: 'production',
    attributes: {},
  },
  {
    id: 'user-api-limits',
    name: 'User API Limits',
    enabled: true,
    scope: 'PER_USER',
    keyStrategyId: 'userId',
    onLimitExceedPolicy: 'WAIT_FOR_REFILL',
    bands: [
      { windowSeconds: 1, capacity: 50, label: '50-per-second' },
      { windowSeconds: 60, capacity: 500, label: '500-per-minute' },
    ],
    tags: ['user-api', 'premium'],
    ruleSetId: 'production',
    attributes: {},
  },
  {
    id: 'webhook-limits',
    name: 'Webhook Delivery',
    enabled: false,
    scope: 'PER_API_KEY',
    keyStrategyId: 'apiKey',
    onLimitExceedPolicy: 'WAIT_FOR_REFILL',
    bands: [{ windowSeconds: 1, capacity: 100, label: '100-per-second' }],
    tags: ['webhook', 'integration'],
    ruleSetId: 'development',
    attributes: {},
  },
];

export const stats: Stats = {
  totalRules: 12,
  activeRules: 10,
  disabledRules: 2,
  totalRuleSets: 3,
  lastUpdated: new Date().toISOString(),
};
