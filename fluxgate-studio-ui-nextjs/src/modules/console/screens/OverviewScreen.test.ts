import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type MenuId } from '@/lib/menuPolicy';
import { ThemeProvider } from '@/modules/admin';

const state = vi.hoisted(() => ({
  menus: ['overview', 'audit', 'keys'] as MenuId[],
  keys: [] as (string | null)[],
  privateKey: 'sensitive-cached-key',
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/overview',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('../I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key, locale: 'en' }) }));
vi.mock('../MeProvider', () => ({ useMe: () => ({ menus: state.menus }) }));
vi.mock('../UserMenu', () => ({ UserMenu: () => null }));
vi.mock('../useLive', () => ({
  useNow: () => 0,
  useLive: (key: string | null) => {
    state.keys.push(key);
    if (key?.startsWith('series:')) {
      return { data: { buckets: [], from: 0, to: 60_000, bucketMillis: 60_000 } };
    }
    if (key?.startsWith('top:')) {
      return {
        data: [
          {
            key: state.privateKey,
            masked: false,
            ruleSetId: 'private-set',
            rejected: 5,
            lastRejectedAt: 500,
          },
          {
            key: 'masked***',
            masked: true,
            ruleSetId: 'masked-set',
            rejected: 3,
            lastRejectedAt: 600,
          },
        ],
      };
    }
    return {};
  },
}));
vi.mock(import('../ui'), async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    Panel: ({ children, data }: React.ComponentProps<typeof original.Panel>) =>
      React.createElement(
        'div',
        null,
        typeof children === 'function' ? children(false) : children,
        JSON.stringify(data)
      ),
  };
});

import { OverviewScreen } from './OverviewScreen';

const render = () =>
  renderToStaticMarkup(
    React.createElement(ThemeProvider, null, React.createElement(OverviewScreen))
  );

beforeEach(() => {
  state.menus = ['overview', 'audit', 'keys'];
  state.keys = [];
});

describe('Overview cross-menu permissions', () => {
  it('removes audit fetches and excludes an unmasked cached row from the table and export data', () => {
    expect(render()).toContain(state.privateKey);
    expect(state.keys.some((key) => key?.startsWith('notes:'))).toBe(true);
    const highScope = state.keys.find((key) => key?.startsWith('top:'));

    state.keys = [];
    state.menus = ['overview'];
    const html = render();
    expect(html).not.toContain(state.privateKey);
    expect(html).not.toContain('private-set');
    expect(html).toContain('masked***');
    expect(state.keys.some((key) => key?.startsWith('notes:'))).toBe(false);
    expect(state.keys.find((key) => key?.startsWith('top:'))).not.toEqual(highScope);
  });
});
