'use client';

import { useCallback, useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
const memory = new Map<string, boolean>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function read(key: string, fallback: boolean): boolean {
  if (memory.has(key)) return memory.get(key) as boolean;
  try {
    const value = window.localStorage.getItem(key);
    return value === null ? fallback : value === '1';
  } catch {
    return fallback;
  }
}

export function usePersistentFlag(
  key: string,
  fallback: boolean
): [boolean, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback
  );
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      try {
        window.localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Storage can be blocked, the choice then lasts for this page only.
      }
      listeners.forEach((listener) => listener());
    },
    [key]
  );
  return [value, set];
}
