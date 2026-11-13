'use client';

import React from 'react';

import { ThemeProvider } from '@/modules/admin';
import { I18nProvider } from '@/modules/console/I18nProvider';
import { MeProvider } from '@/modules/console/MeProvider';
import { Shell } from '@/modules/console/Shell';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <MeProvider>
          <Shell>{children}</Shell>
        </MeProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
