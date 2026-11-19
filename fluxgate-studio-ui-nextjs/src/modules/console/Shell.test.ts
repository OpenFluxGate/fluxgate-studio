import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import { type MenuId } from '@/lib/menuPolicy';

const state = vi.hoisted(() => ({
  pathname: '/rules',
  loading: false,
  menus: [] as MenuId[],
  error: undefined as Error | undefined,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('./MeProvider', () => ({ useMe: () => ({ ...state, retry: vi.fn() }) }));
vi.mock('./I18nProvider', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('./branding', () => ({ BrandMark: () => null }));
vi.mock('./controls', () => ({ BUTTON: '', Tooltip: () => null }));
vi.mock('./ui', () => ({
  errorText: (error: Error) => error.message,
  Notice: ({ children }: { children: React.ReactNode }) => children,
  Forbidden: () => React.createElement('p', null, 'common.forbidden'),
  PageHeader: () => null,
}));

import { Shell } from './Shell';

const protectedScreen = vi.fn(() => React.createElement('p', null, 'authorized screen'));
const render = () =>
  renderToStaticMarkup(React.createElement(Shell, null, React.createElement(protectedScreen)));

beforeEach(() => {
  state.pathname = '/rules';
  state.loading = false;
  state.error = undefined;
  state.menus = [];
  protectedScreen.mockClear();
});

describe('console route permissions', () => {
  it('keeps protected screens unmounted until the permissions load', () => {
    state.loading = true;
    expect(render()).toContain('common.loading');
    expect(protectedScreen).not.toHaveBeenCalled();
  });

  it('lists the effective menus and never mounts a denied direct route', () => {
    state.menus = ['overview', 'settings'];
    const html = render();
    expect(html).toContain('href="/overview"');
    expect(html).toContain('href="/settings"');
    expect(html).not.toContain('href="/rules"');
    expect(html).toContain('common.forbidden');
    expect(protectedScreen).not.toHaveBeenCalled();
  });

  it('mounts the screen when the direct route is permitted', () => {
    state.menus = ['rules'];
    expect(render()).toContain('authorized screen');
    expect(protectedScreen).toHaveBeenCalledOnce();
  });

  it('keeps protected screens unmounted during a menu policy outage', () => {
    state.error = new ApiError(503, 'Menu policy unavailable');
    expect(render()).toContain('menus.unavailable');
    expect(protectedScreen).not.toHaveBeenCalled();
  });
});
