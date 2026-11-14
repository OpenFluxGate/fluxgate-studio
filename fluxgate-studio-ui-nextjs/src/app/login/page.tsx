'use client';

import React, { useState } from 'react';
import { signIn } from 'next-auth/react';

import { ArrowRight } from 'lucide-react';

import { ThemeProvider } from '@/modules/admin';
import { I18nProvider, useI18n } from '@/modules/console/I18nProvider';

function LoginContent() {
  const { t } = useI18n();
  const [isLoading, setIsLoading] = useState(false);

  const handleKeycloakLogin = async () => {
    setIsLoading(true);
    await signIn('keycloak', { callbackUrl: '/overview' });
  };

  return (
    <div className="bg-bg text-fg flex min-h-screen items-center justify-center p-4">
      <div className="border-line bg-panel w-full max-w-xs rounded border p-6">
        <div className="mb-1 flex items-center gap-2 text-sm font-bold">
          <span className="bg-fg inline-block h-3 w-3 rounded-sm" />
          FluxGate Studio
        </div>
        <p className="text-muted mb-5 text-xs">{t('login.subtitle')}</p>
        <button
          type="button"
          onClick={handleKeycloakLogin}
          disabled={isLoading}
          className="bg-fg text-panel flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-xs font-medium hover:opacity-90 disabled:opacity-50"
        >
          {isLoading ? t('login.redirecting') : t('login.signIn')}
          <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <ThemeProvider>
      <I18nProvider>
        <LoginContent />
      </I18nProvider>
    </ThemeProvider>
  );
}
