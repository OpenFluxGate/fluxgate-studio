import { describe, expect, it } from 'vitest';

import { describeBand, formatLimit, formatPeriod } from './ruleMeaning';

describe('rule meaning', () => {
  it('describes a whole second refill period', () => {
    expect(describeBand({ windowSeconds: 60, capacity: 30 }, 'ko')).toBe(
      '처음 30회 연속, 이후 2초마다 1회'
    );
    expect(describeBand({ windowSeconds: 60, capacity: 30 }, 'en')).toBe(
      '30 at once, then 1 every 2s'
    );
  });

  it('switches to minutes and hours on exact multiples', () => {
    expect(formatPeriod(120, 'ko')).toBe('2분');
    expect(formatPeriod(3600, 'ko')).toBe('1시간');
    expect(describeBand({ windowSeconds: 600, capacity: 5 }, 'ko')).toBe(
      '처음 5회 연속, 이후 2분마다 1회'
    );
  });

  it('rounds fractional periods and says so', () => {
    expect(describeBand({ windowSeconds: 60, capacity: 7 }, 'ko')).toBe(
      '처음 7회 연속, 이후 약 8.6초마다 1회'
    );
    expect(formatPeriod(8.57, 'en')).toBe('about 8.6s');
  });

  it('returns nothing for an incomplete band', () => {
    expect(describeBand({ windowSeconds: 0, capacity: 5 }, 'en')).toBe('');
    expect(describeBand({ windowSeconds: 60, capacity: 0 }, 'en')).toBe('');
  });

  it('formats the compact limit', () => {
    expect(formatLimit({ windowSeconds: 600, capacity: 5 })).toBe('600s·5');
  });
});
