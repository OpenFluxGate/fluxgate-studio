import { describe, expect, it } from 'vitest';

import { decisionEventParams } from './decisionEvents';

describe('bounded decision event queries', () => {
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
