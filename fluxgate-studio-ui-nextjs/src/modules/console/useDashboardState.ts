'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { type DashboardState, parseState, serializeState } from '@/lib/timeRange';

export function useDashboardState(): [DashboardState, (next: Partial<DashboardState>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = params.toString();
  const state = useMemo(() => parseState(new URLSearchParams(query)), [query]);
  const update = useCallback(
    (next: Partial<DashboardState>) => {
      const merged = { ...state, ...next };
      const serialized = serializeState(merged, new URLSearchParams(query)).toString();
      router.replace(`${pathname}?${serialized}`, { scroll: false });
    },
    [state, query, router, pathname]
  );
  return [state, update];
}
