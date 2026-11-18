import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  hydrated: false,
  hydrationSequence: [] as boolean[],
  data: undefined as undefined | { canWrite: boolean; username: string; roles: string[] },
  error: undefined as Error | undefined,
  loading: false,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('swr', () => ({
  default: () => ({
    data: state.data,
    error: state.error,
    isLoading: state.loading,
    mutate: vi.fn(),
  }),
}));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof React>();
  return {
    ...actual,
    useSyncExternalStore: (_subscribe: unknown, client: () => boolean, server: () => boolean) =>
      (state.hydrationSequence.shift() ?? state.hydrated) ? client() : server(),
  };
});

import { MeProvider, useMe } from './MeProvider';

function Snapshot() {
  const { me, isAdmin, loading, error, menus } = useMe();
  return React.createElement(
    'output',
    null,
    JSON.stringify({ me, isAdmin, loading, menus, error: error?.message })
  );
}
const render = () =>
  renderToStaticMarkup(React.createElement(MeProvider, null, React.createElement(Snapshot)));

beforeEach(() => {
  state.hydrated = false;
  state.hydrationSequence = [];
  state.data = undefined;
  state.error = undefined;
  state.loading = false;
});

describe('permission hydration snapshot', () => {
  it('keeps a late consumer stable even when its sibling already sees warm admin context', () => {
    state.data = { canWrite: true, username: 'warm-admin', roles: ['ADMIN'] };
    state.hydrationSequence = [true, false];
    const html = renderToStaticMarkup(
      React.createElement(
        MeProvider,
        null,
        React.createElement(Snapshot),
        React.createElement(Snapshot)
      )
    );
    const snapshots = html.match(/<output>.*?<\/output>/g)!;
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toContain('&quot;isAdmin&quot;:true');
    expect(snapshots[0]).toContain('warm-admin');
    expect(snapshots[1]).toContain('&quot;isAdmin&quot;:false');
    expect(snapshots[1]).toContain('&quot;loading&quot;:true');
    expect(snapshots[1]).not.toContain('warm-');
  });

  it('keeps the server/initial hydration snapshot identical with cold or warm admin cache', () => {
    const cold = render();
    state.data = { canWrite: true, username: 'cached-admin', roles: ['ADMIN'] };
    state.error = Error('cached-error');
    expect(render()).toBe(cold);
    expect(cold).toContain('&quot;isAdmin&quot;:false');
    expect(cold).toContain('&quot;loading&quot;:true');
    expect(cold).not.toContain('cached-');
  });
  it('uses current cached permissions after hydration, including viewer downgrade', () => {
    state.hydrated = true;
    state.data = { canWrite: true, username: 'admin', roles: ['ADMIN'] };
    expect(render()).toContain('&quot;isAdmin&quot;:true');
    expect(render()).toContain('&quot;loading&quot;:false');
    state.data = { canWrite: false, username: 'viewer', roles: ['USER'] };
    expect(render()).toContain('&quot;isAdmin&quot;:false');
    expect(render()).toContain('viewer');
  });
  it('removes all permissions when a warm session can no longer be verified', () => {
    state.hydrated = true;
    state.data = { canWrite: true, username: 'old-admin', roles: ['ADMIN'] };
    state.error = Error('policy unavailable');
    const snapshot = render();
    expect(snapshot).toContain('&quot;menus&quot;:[]');
    expect(snapshot).toContain('&quot;isAdmin&quot;:false');
    expect(snapshot).not.toContain('old-admin');
  });

  it('exposes loading and non-authentication errors only after hydration', () => {
    state.error = Error('request-failed');
    expect(render()).not.toContain('request-failed');
    state.hydrated = true;
    state.loading = true;
    expect(render()).toContain('request-failed');
    expect(render()).toContain('&quot;loading&quot;:true');
  });
});
