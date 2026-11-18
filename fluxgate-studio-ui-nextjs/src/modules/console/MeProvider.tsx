'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import useSWR from 'swr';

import { ApiError, type ApiMe, fetchMe } from '@/lib/api';
import { type MenuId, sessionMenus } from '@/lib/menuPolicy';

interface MeValue {
  me?: ApiMe;
  menus: readonly MenuId[];
  isAdmin: boolean;
  loading: boolean;
  error?: Error;
  retry: () => void;
}

const PENDING: MeValue = { menus: [], isAdmin: false, loading: true, retry: () => {} };
const MeContext = createContext<MeValue>(PENDING);

const POLICY_SIGNAL = 'studio-menu-policy-updated';

// Each consumer can hydrate later than its provider (streamed Suspense).
// Keep its permission snapshot identical to SSR until that consumer hydrates.
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

function connectPolicyChannel(): BroadcastChannel | undefined {
  try {
    if (typeof BroadcastChannel === 'function') return new BroadcastChannel(POLICY_SIGNAL);
  } catch {
    // Focus and polling still refresh sessions if the browser blocks cross-tab messaging.
  }
}

export function notifyMenuPolicySaved() {
  const channel = connectPolicyChannel();
  if (!channel) return;
  channel.postMessage(null);
  channel.close();
}

export function MeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR('me', fetchMe, {
    refreshInterval: 10_000,
    revalidateOnFocus: true,
    shouldRetryOnError: (failure: Error) =>
      !(failure instanceof ApiError && (failure.status === 401 || failure.status === 403)),
  });
  const unauthorized = error instanceof ApiError && error.status === 401;
  const me = error ? undefined : data;

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  useEffect(() => {
    const channel = connectPolicyChannel();
    if (!channel) return;
    channel.onmessage = () => void mutate();
    return () => channel.close();
  }, [mutate]);

  return (
    <MeContext.Provider
      value={{
        me,
        menus: sessionMenus(me),
        isAdmin: me?.canWrite === true && Array.isArray(me.roles) && me.roles.includes('ADMIN'),
        loading: isLoading || unauthorized,
        error: unauthorized ? undefined : error,
        retry: () => {
          void mutate();
        },
      }}
    >
      {children}
    </MeContext.Provider>
  );
}

export function useMe(): MeValue {
  const value = useContext(MeContext);
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  return hydrated ? value : PENDING;
}
