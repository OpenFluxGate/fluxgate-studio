import { describe, expect, it } from 'vitest';

import { fieldLabel, policyLabel, scopeLabel, valueLabel } from './labels';

describe('labels', () => {
  it('translates known enum values and keeps unknown ones', () => {
    expect(scopeLabel('PER_USER', 'ko')).toBe('사용자별');
    expect(policyLabel('REJECT_REQUEST', 'en')).toBe('Reject (429)');
    expect(fieldLabel('bands', 'ko')).toBe('한도');
    expect(scopeLabel('SOMETHING_NEW', 'ko')).toBe('SOMETHING_NEW');
  });

  it('formats values for people', () => {
    expect(valueLabel('bands', [{ windowSeconds: 600, capacity: 5 }], 'ko')).toBe('10분 5회');
    expect(valueLabel('enabled', true, 'en')).toBe('on');
    expect(valueLabel('tags', [], 'ko')).toBe('없음');
    expect(valueLabel('attributes', {}, 'ko')).toBe('없음');
    expect(valueLabel('attributes', { tier: 'gold' }, 'ko')).toBe('tier: gold');
    expect(valueLabel('name', null, 'en')).toBe('none');
  });
  it('describes stored images and nested values for people', () => {
    expect(valueLabel('logo', 'image/svg+xml, 0.2 KB, 19df83b0', 'ko')).toBe('SVG 이미지, 0.2 KB');
    expect(valueLabel('favicon', 'image/x-icon, 1.1 KB, aa', 'en')).toBe('ICO image, 1.1 KB');
    expect(valueLabel('logo', 'unreadable', 'en')).toBe('unreadable');
    expect(valueLabel('attributes', { tags: [] }, 'ko')).toBe('없음');
    expect(valueLabel('attributes', { tags: ['a', 'b'], tier: 'gold' }, 'en')).toBe(
      'tags: a, b, tier: gold'
    );
  });
});
