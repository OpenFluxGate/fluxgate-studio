'use client';

import React, { createContext, useContext, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import useSWR from 'swr';

import { ApiError, type ApiMe, fetchMe } from '@/lib/api';

interface MeValue {
  me?: ApiMe;
  isAdmin: boolean;
  loading: boolean;
}

const MeContext = createContext<MeValue>({ isAdmin: false, loading: true });

export function MeProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data, error, isLoading } = useSWR('me', fetchMe, { revalidateOnFocus: false });

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      router.replace('/login');
    }
  }, [error, router]);

  return (
    <MeContext.Provider value={{ me: data, isAdmin: !!data?.canWrite, loading: isLoading }}>
      {children}
    </MeContext.Provider>
  );
}

export const useMe = () => useContext(MeContext);
