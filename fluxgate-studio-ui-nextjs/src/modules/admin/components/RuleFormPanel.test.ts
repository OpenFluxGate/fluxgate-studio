import { describe, expect, it } from 'vitest';

import { validateRule } from './RuleFormPanel';

const form: Parameters<typeof validateRule>[0] = {
  id: 'numeric-rule',
  name: 'Numeric rule',
  enabled: true,
  scope: 'GLOBAL',
  keyStrategyId: 'global',
  onLimitExceedPolicy: 'REJECT_REQUEST',
  bands: [{ windowSeconds: 60, capacity: 100, label: 'minute' }],
  ruleSetId: 'set',
  tags: [],
  version: 0,
};

describe('integer form fields', () => {
  it.each(['capacity', 'windowSeconds'] as const)('rejects unsafe and fractional %s', (field) => {
    for (const value of [9007199254740992, 1.5, NaN, Infinity]) {
      expect(
        validateRule({ ...form, bands: [{ ...form.bands[0], [field]: value }] })
      ).toHaveProperty(`bands[0].${field}`, expect.stringContaining('safe integer'));
    }
  });
  it('rejects an unsafe optimistic revision', () => {
    expect(validateRule({ ...form, version: 9007199254740992 })).toHaveProperty('version');
  });
  it('accepts the largest exactly representable integer at the form boundary', () => {
    expect(
      validateRule({
        ...form,
        version: Number.MAX_SAFE_INTEGER,
        bands: [
          {
            windowSeconds: Number.MAX_SAFE_INTEGER,
            capacity: Number.MAX_SAFE_INTEGER,
            label: 'max',
          },
        ],
      })
    ).toEqual({});
  });
});
