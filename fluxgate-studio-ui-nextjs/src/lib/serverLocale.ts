import { cookies, headers } from 'next/headers';

import { defaultLocale, type Locale } from './i18n';

/** Language for the first paint. The saved choice wins, then the browser language. */
export async function requestLocale(): Promise<Locale> {
  const saved = (await cookies()).get('studio_locale')?.value;
  if (saved === 'ko' || saved === 'en') return saved;
  const preferred = ((await headers()).get('accept-language') ?? '')
    .split(',')[0]
    ?.trim()
    .toLowerCase();
  if (preferred?.startsWith('ko')) return 'ko';
  if (preferred?.startsWith('en')) return 'en';
  return defaultLocale();
}
