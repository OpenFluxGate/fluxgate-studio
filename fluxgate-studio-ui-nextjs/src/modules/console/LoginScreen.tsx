'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';

import { ArrowRight } from 'lucide-react';

import { type Locale } from '@/lib/i18n';

import { BrandMark } from './branding';
import { useI18n } from './I18nProvider';
import { Notice } from './ui';

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

export function LoginScreen({ error }: { error?: string }) {
  const { t, locale, setLocale } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    await signIn('keycloak', { callbackUrl: '/' });
  };

  return (
    <main className="bg-bg text-fg flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="border-line bg-panel border-t-s1 rounded-xl border border-t-[3px] p-6 shadow-sm sm:p-8">
          <div className="mb-3 flex items-center gap-3">
            <BrandMark size={32} />
            <h1 className="text-2xl font-semibold tracking-tight">FluxGate Studio</h1>
          </div>
          <p className="text-muted mb-5 text-[13px]">{t('login.subtitle')}</p>
          {error && (
            <Notice tone="bad">
              {error === 'AccessDenied' ? t('login.denied') : t('login.error')}
            </Notice>
          )}
          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoading}
            aria-busy={isLoading}
            className="bg-primary hover:bg-primary-hover inline-flex h-11 w-full items-center justify-center gap-1.5 rounded px-3 text-[13px] font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? t('login.redirecting') : t('login.signIn')}
            <ArrowRight size={15} aria-hidden />
          </button>
          <p className="text-muted mt-4 text-xs leading-relaxed">{t('login.help')}</p>
        </div>
        <div
          role="group"
          aria-label={t('login.language')}
          className="mt-3 flex justify-center gap-1 text-xs"
        >
          {LOCALES.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={locale === option.value}
              lang={option.value}
              onClick={() => setLocale(option.value)}
              className={`min-h-9 rounded-md px-3 ${locale === option.value ? 'bg-panel2 text-fg font-medium' : 'text-muted hover:text-fg'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
