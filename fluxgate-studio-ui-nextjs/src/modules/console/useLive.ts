'use client';

import { useState, useSyncExternalStore } from 'react';

import useSWR from 'swr';

export const REFRESH_MS = 10_000;

export function useLive<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  refreshMs: number = REFRESH_MS
) {
  const [lastSuccess, setLastSuccess] = useState<{ key: string | null; at: number } | null>(null);
  const result = useSWR<T>(key, fetcher, {
    refreshInterval: refreshMs,
    refreshWhenHidden: false,
    revalidateOnFocus: true,
    // Retain SWR's same-key data on refresh errors, never another range/filter's values.
    keepPreviousData: false,
    onSuccess: () => setLastSuccess({ key, at: Date.now() }),
  });
  return { ...result, updatedAt: lastSuccess?.key === key ? lastSuccess.at : null };
}

function subscribeToClock(listener: () => void) {
  const id = window.setInterval(listener, 1000);
  return () => window.clearInterval(id);
}

function currentSecond(): number {
  return Math.floor(Date.now() / 1000) * 1000;
}

/** Wall clock that ticks once a second. It reads zero during server rendering. */
export function useNow(): number {
  return useSyncExternalStore(subscribeToClock, currentSecond, () => 0);
}
