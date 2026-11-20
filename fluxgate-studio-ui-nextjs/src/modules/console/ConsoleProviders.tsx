'use client';

import React, { Suspense } from 'react';

import { type Locale } from '@/lib/i18n';
import { ThemeProvider } from '@/modules/admin';

import { I18nProvider } from './I18nProvider';
import { MeProvider } from './MeProvider';
import { Shell } from './Shell';

export function ConsoleProviders({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <I18nProvider initialLocale={initialLocale}>
        <MeProvider>
          <Suspense>
            <Shell>{children}</Shell>
          </Suspense>
        </MeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
