import { describe, expect, it } from 'vitest';

import { type Rule } from '@/modules/admin/types';

import { diffRules } from './ruleDiff';

const rule: Rule = {
  id: 'r1',
  name: 'Rule',
  enabled: true,
  scope: 'PER_USER',
  keyStrategyId: 'userId',
  onLimitExceedPolicy: 'REJECT_REQUEST',
  bands: [{ windowSeconds: 60, capacity: 30, label: '' }],
  ruleSetId: 'set',
  tags: ['a'],
  attributes: {},
  version: 1,
};

describe('diffRules', () => {
  it('lists only the fields that change', () => {
    expect(
      diffRules(rule, { ...rule, bands: [{ windowSeconds: 60, capacity: 20, label: '' }] })
    ).toEqual([{ field: 'bands', before: '60s·30', after: '60s·20' }]);
  });

  it('treats a new rule as a change from nothing', () => {
    const changes = diffRules(null, rule);
    expect(changes.find((change) => change.field === 'name')).toEqual({
      field: 'name',
      before: '',
      after: 'Rule',
    });
  });

  it('returns nothing when the edit is a no op', () => {
    expect(diffRules(rule, { ...rule })).toEqual([]);
  });
});
