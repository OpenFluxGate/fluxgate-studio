import { describe, expect, it } from 'vitest';

import { en, ko, translate } from './i18n';

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'keys.counts', { allowed: 3, rejected: 1 })).toBe(
      'Allowed 3 · Rejected 1'
    );
  });

  it('leaves unknown placeholders visible', () => {
    expect(translate('en', 'keys.counts')).toBe('Allowed {allowed} · Rejected {rejected}');
  });

  it('has a Korean entry for every English key', () => {
    expect(Object.keys(ko).sort()).toEqual(Object.keys(en).sort());
  });
});
