import { describe, expect, it } from 'vitest';

import { relativeChange } from './relativeChange';

describe('dashboard comparisons', () => {
  it('does not report zero percent for new traffic after an empty window', () => {
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(0, 0)).toBe(0);
  });
  it('calculates ordinary increases and decreases', () => {
    expect(relativeChange(150, 100)).toBe(0.5);
    expect(relativeChange(0, 100)).toBe(-1);
    expect(relativeChange(100, 100)).toBe(0);
  });
  it('rejects invalid counts rather than showing a misleading trend', () => {
    expect(relativeChange(Infinity, 1)).toBeNull();
    expect(relativeChange(1, NaN)).toBeNull();
    expect(relativeChange(-1, 1)).toBeNull();
  });
});
