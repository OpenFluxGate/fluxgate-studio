import React from 'react';

import { readBranding } from '@/lib/adminApi';
import { requestLocale } from '@/lib/serverLocale';
import { ThemeProvider } from '@/modules/admin/contexts/ThemeContext';
import { BrandingFallback } from '@/modules/console/branding';
import { I18nProvider } from '@/modules/console/I18nProvider';
import { LoginScreen } from '@/modules/console/LoginScreen';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ error }, locale, branding] = await Promise.all([
    searchParams,
    requestLocale(),
    readBranding(),
  ]);
  return (
    <BrandingFallback branding={branding}>
      <ThemeProvider>
        <I18nProvider initialLocale={locale}>
          <LoginScreen error={typeof error === 'string' ? error : undefined} />
        </I18nProvider>
      </ThemeProvider>
    </BrandingFallback>
  );
}
