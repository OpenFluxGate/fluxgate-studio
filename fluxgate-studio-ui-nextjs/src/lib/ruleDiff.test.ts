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
    ).toEqual([{ field: 'bands', before: '30 per 1 min', after: '20 per 1 min' }]);
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

describe('readable values', () => {
  it('shows enums and booleans in the chosen language', () => {
    expect(diffRules(rule, { ...rule, enabled: false, scope: 'PER_IP' }, 'ko')).toEqual([
      { field: 'enabled', before: '켜짐', after: '꺼짐' },
      { field: 'scope', before: '사용자별', after: 'IP별' },
    ]);
  });
});
