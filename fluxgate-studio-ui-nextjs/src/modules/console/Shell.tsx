'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signOut } from 'next-auth/react';

import {
  Gauge,
  History,
  KeyRound,
  Languages,
  ListChecks,
  LogOut,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  SunMoon,
} from 'lucide-react';

import { AUDIT_FAILED_EVENT } from '@/lib/api';
import { type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';
import { KioskContext } from './kiosk';
import { useMe } from './MeProvider';
import { usePersistentFlag } from './persistentFlag';
import { Notice } from './ui';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge; adminOnly: boolean }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge, adminOnly: false },
  { href: '/rules', label: 'nav.rules', icon: ListChecks, adminOnly: false },
  { href: '/keys', label: 'nav.keys', icon: KeyRound, adminOnly: true },
  { href: '/audit', label: 'nav.audit', icon: History, adminOnly: true },
];

const NEXT_MODE: Record<ColorMode, ColorMode> = { dark: 'light', light: 'system', system: 'dark' };
const MODE_ICON = { dark: Moon, light: Sun, system: SunMoon };

const RAIL_BUTTON =
  'flex h-8 w-full items-center gap-2 rounded px-2 text-muted hover:bg-panel2 hover:text-fg';

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { me, isAdmin } = useMe();
  const [expanded, setExpanded] = usePersistentFlag('studio-sidebar-expanded', false);
  const [auditFailed, setAuditFailed] = useState(false);

  const kiosk = params.has('kiosk');
  const setKiosk = useCallback(
    (on: boolean) => {
      const next = new URLSearchParams(params.toString());
      if (on) next.set('kiosk', '');
      else next.delete('kiosk');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router]
  );
  const kioskValue = useMemo(() => ({ kiosk, setKiosk }), [kiosk, setKiosk]);

  useEffect(() => {
    const onFailure = () => setAuditFailed(true);
    window.addEventListener(AUDIT_FAILED_EVENT, onFailure);
    return () => window.removeEventListener(AUDIT_FAILED_EVENT, onFailure);
  }, []);

  useEffect(() => {
    if (!kiosk) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setKiosk(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kiosk, setKiosk]);

  const ModeIcon = MODE_ICON[mode];
  const label = (text: string) => (expanded ? <span className="truncate">{text}</span> : null);

  return (
    <KioskContext.Provider value={kioskValue}>
      <div className="bg-bg text-fg flex min-h-screen">
        {!kiosk && (
          <aside
            className={`border-line bg-panel sticky top-0 flex h-screen shrink-0 flex-col border-r px-1.5 py-2 text-xs ${expanded ? 'w-44' : 'w-12'}`}
          >
            <div className="mb-3 flex h-8 items-center gap-2 px-2 text-sm font-semibold">
              <span className="bg-s1 inline-block h-4 w-4 shrink-0 rounded" />
              {label('FluxGate')}
            </div>
            <nav className="flex flex-col gap-0.5">
              {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={t(item.label)}
                    aria-current={active ? 'page' : undefined}
                    className={`relative flex h-8 items-center gap-2 rounded px-2 ${active ? 'bg-panel2 text-fg' : 'text-muted hover:bg-panel2 hover:text-fg'}`}
                  >
                    {active && (
                      <span className="bg-s1 absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded" />
                    )}
                    <Icon size={16} className="shrink-0" />
                    {label(t(item.label))}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto flex flex-col gap-0.5">
              {expanded && me && (
                <div className="text-muted mb-1 px-2 text-[11px]">
                  <div className="text-fg2 truncate">{me.name || me.username}</div>
                  <div>{t(me.canWrite ? 'role.admin' : 'role.viewer')}</div>
                </div>
              )}
              <button
                type="button"
                title={t('nav.language')}
                className={RAIL_BUTTON}
                onClick={() => setLocale(locale === 'ko' ? 'en' : 'ko')}
              >
                <Languages size={16} className="shrink-0" />
                {label(locale === 'ko' ? '한국어' : 'English')}
              </button>
              <button
                type="button"
                title={`${t('nav.theme')}: ${t(`mode.${mode}` as MessageKey)}`}
                className={RAIL_BUTTON}
                onClick={() => setMode(NEXT_MODE[mode])}
              >
                <ModeIcon size={16} className="shrink-0" />
                {label(t(`mode.${mode}` as MessageKey))}
              </button>
              <button
                type="button"
                title={t('common.signOut')}
                className={RAIL_BUTTON}
                onClick={() => signOut({ callbackUrl: '/login' })}
              >
                <LogOut size={16} className="shrink-0" />
                {label(t('common.signOut'))}
              </button>
              <button
                type="button"
                title={t(expanded ? 'nav.collapse' : 'nav.expand')}
                className={RAIL_BUTTON}
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <PanelLeftClose size={16} className="shrink-0" />
                ) : (
                  <PanelLeftOpen size={16} className="shrink-0" />
                )}
                {label(t('nav.collapse'))}
              </button>
            </div>
          </aside>
        )}
        <main className="min-w-0 flex-1 p-4">
          {kiosk && (
            <button
              type="button"
              onClick={() => setKiosk(false)}
              className="border-line bg-panel2 text-fg2 fixed top-2 right-2 z-50 inline-flex items-center gap-1 rounded border px-2 py-1 text-xs opacity-60 hover:opacity-100"
            >
              <Minimize2 size={12} />
              {t('tv.exit')}
            </button>
          )}
          {auditFailed && (
            <Notice tone="warn" onClose={() => setAuditFailed(false)}>
              {t('common.auditFailed')}
            </Notice>
          )}
          {children}
        </main>
      </div>
    </KioskContext.Provider>
  );
}
