import { describe, expect, it } from 'vitest';

import { ruleIdentity } from '@/modules/admin/types';

import { ruleUrl } from './api';

describe('scoped rule identities', () => {
  it('encodes both parts without merging separator characters', () => {
    const url = new URL(ruleUrl('shared /?', 'set &=/', '/toggle'), 'http://localhost');
    expect(url.pathname).toBe('/api/proxy/api/rules/shared%20%2F%3F/toggle');
    expect(url.searchParams.get('ruleSetId')).toBe('set &=/');
    expect(url.searchParams.has('unassigned')).toBe(false);
    expect(ruleIdentity({ id: 'b/c', ruleSetId: 'a' })).not.toBe(
      ruleIdentity({ id: 'c', ruleSetId: 'a/b' })
    );
  });
  it('distinguishes legacy, default and explicit unassigned selectors', () => {
    expect(ruleUrl('shared')).toBe('/api/proxy/api/rules/shared');
    expect(ruleUrl('shared', null)).toBe('/api/proxy/api/rules/shared?unassigned=true');
    expect(ruleUrl('shared', 'default')).toBe('/api/proxy/api/rules/shared?ruleSetId=default');
    expect(ruleIdentity({ id: 'shared', ruleSetId: null })).not.toBe(
      ruleIdentity({ id: 'shared', ruleSetId: 'default' })
    );
  });
  it('refuses empty assigned selectors', () => {
    expect(() => ruleUrl('shared', '')).toThrow('must not be empty');
    expect(() => ruleUrl('shared', ' ')).toThrow('must not be empty');
  });
});
