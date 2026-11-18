'use client';

import React, { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';

import useSWR from 'swr';

import { ApiError, type ApiMe, fetchMe } from '@/lib/api';

interface MeValue {
  me?: ApiMe;
  isAdmin: boolean;
  loading: boolean;
  error?: Error;
  retry: () => void;
}

const MeContext = createContext<MeValue>({ isAdmin: false, loading: true, retry: () => {} });

// Each consumer can hydrate later than its provider (streamed Suspense).
// Keep its permission snapshot identical to SSR until that consumer hydrates.
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function MeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useSWR('me', fetchMe, { revalidateOnFocus: false });
  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  return (
    <MeContext.Provider
      value={{
        me: data,
        isAdmin: !!data?.canWrite,
        loading: isLoading,
        error: error && !unauthorized ? (error as Error) : undefined,
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
  return hydrated
    ? value
    : { me: undefined, isAdmin: false, loading: true, error: undefined, retry: value.retry };
}
