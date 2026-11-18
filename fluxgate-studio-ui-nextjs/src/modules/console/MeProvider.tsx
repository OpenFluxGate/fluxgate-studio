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

// SWR can resolve while a streamed Suspense boundary is still hydrating. Keep
// the whole permission snapshot identical to SSR until this consumer hydrates.
const subscribeHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export function MeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hydrated = useSyncExternalStore(subscribeHydration, clientSnapshot, serverSnapshot);
  const { data, error, isLoading, mutate } = useSWR('me', fetchMe, { revalidateOnFocus: false });
  const unauthorized = error instanceof ApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) router.replace('/login');
  }, [unauthorized, router]);

  return (
    <MeContext.Provider
      value={{
        me: hydrated ? data : undefined,
        isAdmin: hydrated && !!data?.canWrite,
        loading: !hydrated || isLoading,
        error: hydrated && error && !unauthorized ? (error as Error) : undefined,
        retry: () => {
          void mutate();
        },
      }}
    >
      {children}
    </MeContext.Provider>
  );
}

export const useMe = () => useContext(MeContext);
