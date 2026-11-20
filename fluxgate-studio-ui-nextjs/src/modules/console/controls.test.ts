import { describe, expect, it } from 'vitest';

import { moveOption } from './controls';

const labels = ['전체', 'checkout-api', 'login-api', 'search-api'];

describe('drop down keys', () => {
  it('moves with arrows and stops at the ends', () => {
    expect(moveOption(labels, 0, 'ArrowDown')).toBe(1);
    expect(moveOption(labels, 3, 'ArrowDown')).toBe(3);
    expect(moveOption(labels, 0, 'ArrowUp')).toBe(0);
    expect(moveOption(labels, 2, 'ArrowUp')).toBe(1);
  });

  it('jumps to the first and last option', () => {
    expect(moveOption(labels, 2, 'Home')).toBe(0);
    expect(moveOption(labels, 0, 'End')).toBe(3);
  });

  it('finds the next option starting with a typed letter', () => {
    expect(moveOption(labels, 0, 's')).toBe(3);
    expect(moveOption(labels, 1, 'L')).toBe(2);
    expect(moveOption(labels, 0, 'x')).toBeNull();
  });

  it('ignores other keys and empty lists', () => {
    expect(moveOption(labels, 1, 'Shift')).toBeNull();
    expect(moveOption([], 0, 'ArrowDown')).toBeNull();
  });
});
