import { describe, expect, it } from 'vitest';

import { decisionEventParams, lastHour, localDateTime } from './decisionEvents';

describe('bounded decision event queries', () => {
  it('includes the sampled millisecond and preserves input precision', () => {
    const now = new Date(2026, 10, 19, 12, 34, 56, 789).getTime();
    const range = lastHour(now);
    expect(range.to).toBe(now + 1);
    expect(range.to - range.from).toBe(3_600_000);
    expect(new Date(localDateTime(range.to)).getTime()).toBe(range.to);
    expect(localDateTime(range.to)).toBe('2026-11-19T12:34:56.790');
  });

  it('encodes opaque cursor without altering interval or injecting query parameters', () => {
    const params = decisionEventParams({
      from: 1000,
      to: 5000,
      outcome: 'REJECT',
      cursor: 'a+/=&limit=999',
    });
    expect(params.get('from')).toBe('1000');
    expect(params.get('to')).toBe('5000');
    expect(params.get('limit')).toBe('50');
    expect(params.get('outcome')).toBe('REJECT');
    expect(params.get('cursor')).toBe('a+/=&limit=999');
  });
  it('allows exactly 24 hours and omits optional filters for a new first page', () => {
    const params = decisionEventParams({ from: 0, to: 86_400_000 });
    expect(params.has('cursor')).toBe(false);
    expect(params.has('outcome')).toBe(false);
  });
  it.each([
    [0, 0],
    [5, 4],
    [-1, 1000],
    [0, 86_400_001],
    [NaN, 1000],
    [0, Infinity],
    [0, 1.5],
  ])('rejects invalid interval %s..%s', (from, to) => {
    expect(() => decisionEventParams({ from, to })).toThrow();
  });
  it.each([0, 101, 1.5])('rejects invalid page size %s', (limit) => {
    expect(() => decisionEventParams({ from: 0, to: 1000, limit })).toThrow();
  });
});
