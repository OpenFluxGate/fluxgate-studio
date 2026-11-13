import { describe, expect, it } from 'vitest';

import { formatAgo, formatCount, formatPercent } from './format';

describe('format', () => {
  const now = 1_794_600_000_000;

  it('formats elapsed time in the largest whole unit', () => {
    expect(formatAgo(now - 3_000, now, 'en')).toBe('3s ago');
    expect(formatAgo(now - 120_000, now, 'ko')).toBe('2분 전');
    expect(formatAgo(now - 7_200_000, now, 'en')).toBe('2h ago');
    expect(formatAgo(now - 172_800_000, now, 'en')).toBe('2d ago');
    expect(formatAgo(now + 5_000, now, 'en')).toBe('0s ago');
  });

  it('formats rates and counts', () => {
    expect(formatPercent(0.029)).toBe('2.9%');
    expect(formatPercent(0)).toBe('0.0%');
    expect(formatCount(61634)).toBe('61,634');
  });
});
