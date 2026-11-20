'use client';

import React, { useEffect } from 'react';

import { Gauge } from 'lucide-react';
import useSWR, { SWRConfig } from 'swr';

import { fetchBranding } from '@/lib/api';
import { type Branding, faviconHref } from '@/lib/branding';

export const BRANDING_KEY = 'branding';

export function useBranding() {
  return useSWR<Branding>(BRANDING_KEY, fetchBranding, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
}

/** The default mark, or the logo an administrator uploaded. */
export function BrandMark({ size = 20, logo }: { size?: number; logo?: string | null }) {
  const { data } = useBranding();
  const src = logo === undefined ? data?.logo : logo;
  if (src) {
    return (
      // A data URL from the Admin API, which next/image cannot optimise.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="bg-primary inline-flex shrink-0 items-center justify-center rounded text-white"
      style={{ width: size, height: size }}
    >
      <Gauge size={Math.round(size * 0.62)} />
    </span>
  );
}

/** Points the browser tab icon at the current favicon after an administrator changes it. */
export function FaviconSync() {
  const { data } = useBranding();
  const version = data?.version ?? null;
  useEffect(() => {
    if (!data) return;
    const href = faviconHref(version);
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]');
    if (links.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = href;
      document.head.appendChild(link);
      return;
    }
    links.forEach((link) => {
      link.href = href;
    });
  }, [data, version]);
  return null;
}

/** Seeds the branding cache with what the server already read, so the logo never flashes. */
export function BrandingFallback({
  branding,
  children,
}: {
  branding: Branding;
  children: React.ReactNode;
}) {
  return (
    <SWRConfig value={{ fallback: { [BRANDING_KEY]: branding } }}>
      <FaviconSync />
      {children}
    </SWRConfig>
  );
}
