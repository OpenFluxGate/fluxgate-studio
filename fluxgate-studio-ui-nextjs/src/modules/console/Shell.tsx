'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { Gauge, History, KeyRound, ListChecks, LogOut } from 'lucide-react';

import { AUDIT_FAILED_EVENT } from '@/lib/api';
import { type Locale, type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';
import { useMe } from './MeProvider';
import { Notice } from './ui';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge; adminOnly: boolean }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge, adminOnly: false },
  { href: '/rules', label: 'nav.rules', icon: ListChecks, adminOnly: false },
  { href: '/keys', label: 'nav.keys', icon: KeyRound, adminOnly: true },
  { href: '/audit', label: 'nav.audit', icon: History, adminOnly: true },
];

const MODES: ColorMode[] = ['system', 'light', 'dark'];
const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, isAdmin } = useMe();
  const [auditFailed, setAuditFailed] = useState(false);

  useEffect(() => {
    const onFailure = () => setAuditFailed(true);
    window.addEventListener(AUDIT_FAILED_EVENT, onFailure);
    return () => window.removeEventListener(AUDIT_FAILED_EVENT, onFailure);
  }, []);

  return (
    <div className="bg-bg text-fg flex min-h-screen">
      <aside className="border-line bg-panel2 sticky top-0 flex h-screen w-44 shrink-0 flex-col border-r px-2 py-3">
        <div className="flex items-center gap-2 px-2 pb-4 text-sm font-bold">
          <span className="bg-fg inline-block h-3 w-3 rounded-sm" />
          FluxGate
        </div>
        <nav className="flex flex-col gap-0.5">
          {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs ${active ? 'bg-line text-fg font-semibold' : 'text-fg2 hover:bg-line/60'}`}
              >
                <Icon size={14} />
                {t(item.label)}
              </Link>
            );
          })}
        </nav>
        <div className="text-muted mt-auto space-y-2 px-2 text-[11px]">
          <div>
            <div className="text-fg2 truncate">{me ? me.name || me.username : '…'}</div>
            {me && <div>{t(me.canWrite ? 'role.admin' : 'role.viewer')}</div>}
          </div>
          <select
            aria-label="language"
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
            className="border-line-strong bg-panel text-fg w-full rounded border px-1 py-0.5 text-[11px]"
          >
            {LOCALES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="color mode"
            value={mode}
            onChange={(event) => setMode(event.target.value as ColorMode)}
            className="border-line-strong bg-panel text-fg w-full rounded border px-1 py-0.5 text-[11px]"
          >
            {MODES.map((option) => (
              <option key={option} value={option}>
                {t(`mode.${option}` as MessageKey)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-fg2 hover:text-fg flex items-center gap-1"
          >
            <LogOut size={12} />
            {t('common.signOut')}
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4">
        {auditFailed && (
          <Notice tone="warn" onClose={() => setAuditFailed(false)}>
            {t('common.auditFailed')}
          </Notice>
        )}
        {children}
      </main>
    </div>
  );
}
