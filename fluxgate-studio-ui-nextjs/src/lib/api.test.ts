import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ruleIdentity } from '@/modules/admin/types';

import {
  AUDIT_FAILED_EVENT,
  createRule,
  type CreateRuleRequest,
  exportRules,
  fetchAudit,
  fetchTimeseries,
  fetchTopRejected,
  importRules,
  lookupKey,
  ruleUrl,
  toggleRule,
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

describe('console API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('announces an audit failure the Admin API reports', async () => {
    const target = new EventTarget();
    const listener = vi.fn();
    target.addEventListener(AUDIT_FAILED_EVENT, listener);
    vi.stubGlobal('window', target);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"id":"r1"}', {
          status: 200,
          headers: { 'content-type': 'application/json', 'x-studio-audit': 'failed' },
        })
      )
    );

    await toggleRule('r1', 'set');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('sends key lookups in the request body, never in the URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"key":"u1"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await lookupKey({ value: '123456789', transform: 'none', window: '24h' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/proxy/api/keys/decisions');
    expect(url).not.toContain('123456789');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      value: '123456789',
      transform: 'none',
      window: '24h',
    });
  });

  it('builds monitoring query strings', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () =>
          new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } })
      );
    vi.stubGlobal('fetch', fetchMock);

    await fetchTopRejected({ window: '24h' }, 5, 'checkout api');
    await fetchAudit({ action: 'RULE_UPDATE', q: 'r1', page: 2, size: 50 });

    expect(fetchMock.mock.calls[0][0]).toBe(
      '/api/proxy/api/monitoring/top-rejected?window=24h&limit=5&ruleSetId=checkout+api'
    );
    expect(fetchMock.mock.calls[1][0]).toBe(
      '/api/proxy/api/audit?page=2&size=50&action=RULE_UPDATE&q=r1'
    );

    await fetchTimeseries({ from: '1', to: '2' }, 'a');
    expect(fetchMock.mock.calls[2][0]).toBe(
      '/api/proxy/api/monitoring/timeseries?from=1&to=2&ruleSetId=a'
    );
  });
});
