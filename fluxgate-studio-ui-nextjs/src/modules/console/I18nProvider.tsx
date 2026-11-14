'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { defaultLocale, type Locale, type MessageKey, translate } from '@/lib/i18n';

const COOKIE = 'studio_locale';
const listeners = new Set<() => void>();

interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readLocale(): Locale {
  const match = document.cookie.match(/(?:^|;\s*)studio_locale=(en|ko)/);
  return match ? (match[1] as Locale) : defaultLocale();
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = useSyncExternalStore(subscribe, readLocale, defaultLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    document.cookie = `${COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    listeners.forEach((listener) => listener());
  }, []);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used within an I18nProvider');
  return context;
}
