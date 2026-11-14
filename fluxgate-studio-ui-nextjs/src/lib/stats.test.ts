import { describe, expect, it } from 'vitest';

import { bucketRates, legendStats, rateSeverity, summarize } from './stats';

describe('panel statistics', () => {
  it('sums buckets into totals and a rate', () => {
    expect(
      summarize([
        { allowed: 90, rejected: 5 },
        { allowed: 0, rejected: 5 },
      ])
    ).toEqual({ total: 100, rejected: 10, rate: 0.1 });
    expect(summarize([])).toEqual({ total: 0, rejected: 0, rate: 0 });
  });

  it('grades the reject rate at one and five percent', () => {
    expect(rateSeverity(0.009)).toBe('ok');
    expect(rateSeverity(0.01)).toBe('warn');
    expect(rateSeverity(0.049)).toBe('warn');
    expect(rateSeverity(0.05)).toBe('bad');
  });

  it('computes legend values', () => {
    expect(legendStats([2, 6, 4])).toEqual({ mean: 4, max: 6, last: 4 });
    expect(legendStats([])).toEqual({ mean: 0, max: 0, last: 0 });
  });

  it('turns buckets into percent rates', () => {
    expect(
      bucketRates([
        { allowed: 3, rejected: 1 },
        { allowed: 0, rejected: 0 },
      ])
    ).toEqual([25, 0]);
  });
});
