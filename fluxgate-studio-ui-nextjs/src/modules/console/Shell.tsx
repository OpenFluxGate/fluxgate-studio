'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import {
  Activity,
  Gauge,
  History,
  KeyRound,
  ListChecks,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
} from 'lucide-react';

import { AUDIT_FAILED_EVENT } from '@/lib/api';
import { type MessageKey } from '@/lib/i18n';

import { BrandMark } from './branding';
import { BUTTON, Tooltip } from './controls';
import { useI18n } from './I18nProvider';
import { KioskContext } from './kiosk';
import { useMe } from './MeProvider';
import { usePersistentFlag } from './persistentFlag';
import { Notice } from './ui';

const NAV: { href: string; label: MessageKey; icon: typeof Gauge; adminOnly: boolean }[] = [
  { href: '/overview', label: 'nav.overview', icon: Gauge, adminOnly: false },
  { href: '/rules', label: 'nav.rules', icon: ListChecks, adminOnly: false },
  { href: '/keys', label: 'nav.keys', icon: KeyRound, adminOnly: true },
  { href: '/events', label: 'nav.events', icon: Activity, adminOnly: true },
  { href: '/audit', label: 'nav.audit', icon: History, adminOnly: true },
  { href: '/settings', label: 'nav.settings', icon: Settings, adminOnly: false },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const { isAdmin, error: meError, retry } = useMe();
  const [expanded, setExpanded] = usePersistentFlag('studio-sidebar-expanded', true);
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

  return (
    <KioskContext.Provider value={kioskValue}>
      <a
        href="#main"
        className="bg-primary sr-only z-[70] rounded px-3 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-1/2 focus:-translate-x-1/2"
      >
        {t('common.skip')}
      </a>
      <div className="bg-bg text-fg flex h-dvh flex-col-reverse overflow-hidden md:flex-row">
        {!kiosk && (
          <aside
            aria-label="FluxGate"
            className={`border-line bg-panel z-40 flex w-full shrink-0 flex-col border-t px-1 pt-1 pb-[max(.25rem,env(safe-area-inset-bottom))] md:h-full md:w-14 md:border-t-0 md:border-r md:p-2 ${expanded ? 'md:w-52' : 'md:w-14'}`}
          >
            <div className="border-line mb-5 hidden min-h-12 items-center gap-2.5 border-b px-2 pb-2 md:flex">
              <BrandMark size={24} />
              {expanded && (
                <span className="hidden text-[15px] font-semibold tracking-tight md:inline">
                  FluxGate Studio
                </span>
              )}
            </div>
            <nav
              className="flex items-stretch gap-0.5 md:flex-col md:gap-1"
              aria-label={t('nav.main')}
            >
              {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                const label = t(item.label);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={label}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-0.5 text-center text-[10px] leading-tight transition-colors md:min-h-10 md:flex-none md:flex-row md:justify-start md:gap-2.5 md:px-2.5 md:text-left md:text-[13px] ${active ? 'bg-select text-s1-text font-semibold' : 'text-fg2 hover:bg-panel2 hover:text-fg'}`}
                  >
                    {active && (
                      <span
                        aria-hidden
                        className="bg-s1 absolute inset-x-3 top-0 h-0.5 rounded md:inset-x-auto md:top-2 md:bottom-2 md:left-0 md:h-auto md:w-0.5"
                      />
                    )}
                    <Icon size={17} aria-hidden className="shrink-0" />
                    <span className={expanded ? 'md:truncate' : 'md:hidden'}>{label}</span>
                    {!expanded && <Tooltip text={label} align="start" />}
                  </Link>
                );
              })}
            </nav>
            <button
              type="button"
              aria-label={t(expanded ? 'nav.collapse' : 'nav.expand')}
              onClick={() => setExpanded(!expanded)}
              className="group text-muted hover:bg-panel2 hover:text-fg relative mt-auto hidden h-9 items-center gap-2.5 rounded px-2.5 text-[13px] transition-colors md:flex"
            >
              {expanded ? (
                <PanelLeftClose size={17} aria-hidden className="shrink-0" />
              ) : (
                <PanelLeftOpen size={17} aria-hidden className="shrink-0" />
              )}
              {expanded ? (
                <span>{t('nav.collapse')}</span>
              ) : (
                <Tooltip text={t('nav.expand')} align="start" />
              )}
            </button>
          </aside>
        )}
        <main
          id="main"
          tabIndex={-1}
          className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-6 outline-none"
        >
          {kiosk && (
            <button
              type="button"
              onClick={() => setKiosk(false)}
              className="border-line bg-panel2 text-fg2 fixed top-2 right-3 z-50 inline-flex h-7 items-center gap-1 rounded border px-2 text-xs opacity-70 transition-opacity hover:opacity-100"
            >
              <Minimize2 size={12} aria-hidden />
              {t('tv.exit')}
            </button>
          )}
          <div className={kiosk ? 'pt-11' : ''}>
            {meError && (
              <Notice tone="bad">
                {t('common.loadFailed')} {meError.message}{' '}
                <button type="button" className={`${BUTTON} ml-2 h-7`} onClick={retry}>
                  {t('common.retry')}
                </button>
              </Notice>
            )}
            {auditFailed && (
              <Notice tone="warn" onClose={() => setAuditFailed(false)}>
                {t('common.auditFailed')}
              </Notice>
            )}
            {children}
          </div>
        </main>
      </div>
    </KioskContext.Provider>
  );
}
