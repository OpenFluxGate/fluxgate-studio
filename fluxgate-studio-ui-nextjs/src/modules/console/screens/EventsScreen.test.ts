import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  admin: true,
  loading: false,
  result: {} as Record<string, unknown>,
  key: null as unknown,
}));
vi.mock('../MeProvider', () => ({
  useMe: () => ({ isAdmin: state.admin, loading: state.loading }),
}));
vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('swr', () => ({
  default: (key: unknown) => {
    state.key = key;
    return { mutate: vi.fn(), isValidating: false, ...state.result };
  },
}));
vi.mock('../ui', () => ({
  Forbidden: () => React.createElement('p', null, 'forbidden'),
  PageIntro: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement('section', null, title, children),
  TD: '',
  TH: '',
}));

import { EventsScreen } from './EventsScreen';

beforeEach(() => {
  state.admin = true;
  state.loading = false;
  state.result = {};
  state.key = null;
});
const render = () => renderToStaticMarkup(React.createElement(EventsScreen));
describe('decision event screen access and data states', () => {
  it('does not fetch or expose rows to viewers', () => {
    state.admin = false;
    state.result = {
      data: { receivedAt: 1000, items: [{ ruleId: 'private-rule' }], nextCursor: null },
    };
    expect(render()).toContain('forbidden');
    expect(state.key).toBeNull();
    expect(render()).not.toContain('private-rule');
  });
  it('distinguishes loading, empty and error rather than inventing records', () => {
    expect(render()).toContain('common.loading');
    state.result = { data: { receivedAt: 1000, items: [], nextCursor: null } };
    expect(render()).toContain('events.empty');
    state.result = { error: Error('sensitive backend diagnostic') };
    const html = render();
    expect(html).toContain('events.failed');
    expect(html).not.toContain('sensitive backend diagnostic');
  });
  it('distinguishes unsafe int64 counters from missing and exactly representable counts', () => {
    const outside = JSON.parse('9223372036854775807') as number;
    const base = { id: 'row', occurredAt: 1000, allowed: true };
    state.result = {
      data: {
        receivedAt: 1000,
        items: [
          { ...base, remainingTokens: outside, retryAfterMillis: outside },
          {
            ...base,
            id: 'other',
            remainingTokens: Number.MAX_SAFE_INTEGER,
            retryAfterMillis: null,
          },
        ],
      },
    };
    const html = render();
    expect(html.match(/events.precisionUnavailable/g)).toHaveLength(2);
    expect(html).not.toContain(String(outside));
    state.result = {
      data: {
        receivedAt: 1000,
        items: [{ ...base, remainingTokens: Number.MAX_SAFE_INTEGER, retryAfterMillis: null }],
      },
    };
    expect(render()).toContain(String(Number.MAX_SAFE_INTEGER));
    expect(render()).toContain('>–</dd>');
  });

  it('renders only the restricted projection and escapes recorded labels', () => {
    state.result = {
      data: {
        receivedAt: 1000,
        items: [
          {
            id: 'id',
            occurredAt: 1000,
            ruleSetId: '<script>',
            ruleId: 'real-rule',
            allowed: false,
            remainingTokens: 0,
            retryAfterMillis: 100,
            key: 'secret-key',
            ip: 'private-ip',
            attributes: { secret: 'credential' },
          },
        ],
        nextCursor: 'next',
      },
    };
    const html = render();
    expect(html).toContain('real-rule');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('events.reject');
    expect(html).not.toMatch(/secret-key|private-ip|credential/);
  });
});
