import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleIdentity } from '@/modules/admin/types';

import {
  createRule,
  type CreateRuleRequest,
  exportRules,
  importRules,
  ruleUrl,
  updateRule,
} from './api';

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

const rule: CreateRuleRequest = {
  id: 'numeric-rule',
  name: 'Numeric rule',
  enabled: true,
  scope: 'GLOBAL',
  keyStrategyId: 'global',
  onLimitExceedPolicy: 'REJECT_REQUEST',
  bands: [{ windowSeconds: 60, capacity: 100, label: 'minute' }],
  attributes: { vendor: { counter: 12, ratio: 0.25, opaque: '9223372036854775807' } },
};
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async () => Response.json({}));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('lossless export and numeric write boundaries', () => {
  it('exports the original JSON bytes including nested BSON int64 values', async () => {
    const original =
      '[{"id":"numeric-rule","attributes":{"nested":[9223372036854775807,-9223372036854775808]},"version":9007199254740993}]';
    fetchMock.mockResolvedValue(
      new Response(original, { headers: { 'Content-Type': 'application/json' } })
    );
    expect(await exportRules()).toBe(original);
  });
  it('rejects unsafe nested numbers parsed from an export before import sends anything', async () => {
    const parsed = JSON.parse(
      '[{"id":"numeric-rule","attributes":{"nested":[9223372036854775807]}}]'
    );
    await expect(importRules(parsed)).rejects.toThrow(/safe integer/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { ...rule, bands: [{ windowSeconds: 9007199254740992, capacity: 100 }] },
    { ...rule, bands: [{ windowSeconds: 60, capacity: 9007199254740992 }] },
    { ...rule, bands: [{ windowSeconds: 1.5, capacity: 100 }] },
    { ...rule, attributes: { extension: [{ counter: -9007199254740992 }] } },
    { ...rule, attributes: { extension: Infinity } },
  ])('rejects unsafe create payload before the network request', async (payload) => {
    await expect(createRule(payload)).rejects.toThrow(/safe integer|finite/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unsafe optimistic version before setting If-Match or sending a body', async () => {
    await expect(updateRule(rule.id, { ...rule, version: 9007199254740992 })).rejects.toThrow(
      /safe integer/
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('preserves safe nested extension fields and integer strings on import and edit', async () => {
    await importRules([rule]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).rules[0]).toEqual(rule);
    await updateRule(rule.id, { ...rule, version: Number.MAX_SAFE_INTEGER });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      ...rule,
      version: Number.MAX_SAFE_INTEGER,
    });
    expect(new Headers(fetchMock.mock.calls[1][1].headers).get('If-Match')).toBe(
      String(Number.MAX_SAFE_INTEGER)
    );
  });
});
