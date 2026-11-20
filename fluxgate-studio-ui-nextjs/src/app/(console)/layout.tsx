import React from 'react';

import { readBranding } from '@/lib/adminApi';
import { requestLocale } from '@/lib/serverLocale';
import { BrandingFallback } from '@/modules/console/branding';
import { ConsoleProviders } from '@/modules/console/ConsoleProviders';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const [locale, branding] = await Promise.all([requestLocale(), readBranding()]);
  return (
    <BrandingFallback branding={branding}>
      <ConsoleProviders initialLocale={locale}>{children}</ConsoleProviders>
    </BrandingFallback>
  );
}
