'use client';

import React, { useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  EllipsisVertical,
  Info,
  Maximize2,
  RotateCw,
  Table2,
  XOctagon,
} from 'lucide-react';

import { ApiError } from '@/lib/api';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatAgo, formatClock } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';
import { type Severity } from '@/lib/stats';

import { Sparkline } from './charts';
import { BUTTON, MenuItem, MenuList, Tooltip, usePopover } from './controls';
import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';
import { Modal } from './overlay';
import { usePersistentFlag } from './persistentFlag';
import { useNow } from './useLive';
import { UserMenu } from './UserMenu';

export {
  Badge,
  BUTTON,
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_QUIET,
  Field,
  IconButton,
  INPUT,
} from './controls';

export const TH =
  'border-b border-line px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-muted';
export const TD = 'border-b border-line/70 px-3 py-2 align-middle';

export interface TableData {
  headers: string[];
  rows: (string | number | null)[][];
}

export interface PanelState {
  loading?: boolean;
  error?: unknown;
  /** Refresh failed after a successful response; keep values but label them stale. */
  staleError?: unknown;
  empty?: boolean;
  onRetry?: () => void;
}

function envLabel(
  value: string,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  const key = `env.${value.toLowerCase()}` as MessageKey;
  const text = t(key);
  return text === key ? value : text;
}

export function PageHeader({
  title,
  heading = true,
  children,
}: {
  title: string;
  /** False when the page shows its own large title below the header. */
  heading?: boolean;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const { kiosk } = useKiosk();
  if (kiosk) return null;
  const environment = process.env.NEXT_PUBLIC_ENV_LABEL;
  return (
    <div className="border-line bg-panel sticky top-0 z-30 -mx-4 mb-4 flex min-h-12 flex-wrap items-center gap-3 border-b px-4 py-2 md:flex-nowrap md:py-0">
      <nav aria-label="breadcrumb" className="flex shrink-0 items-center gap-1.5 text-[13px]">
        <span className="text-muted">FluxGate</span>
        <span aria-hidden className="text-faint">
          /
        </span>
        {heading ? (
          <h1 className="text-fg text-[15px] font-semibold whitespace-nowrap">{title}</h1>
        ) : (
          <span aria-current="page" className="text-fg text-[13px] font-medium whitespace-nowrap">
            {title}
          </span>
        )}
      </nav>
      {environment && (
        <span
          title={t('env.label')}
          className="border-line-strong text-fg2 rounded border px-1.5 text-[11px] font-medium"
        >
          {envLabel(environment, t)}
        </span>
      )}
      <div className="order-last flex w-full min-w-0 flex-wrap items-center gap-2 md:order-none md:ml-auto md:w-auto">
        {children}
      </div>
      <UserMenu />
    </div>
  );
}

export function DataTable({ data }: { data: TableData }) {
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr>
          {data.headers.map((header) => (
            <th key={header} scope="col" className={TH}>
              {header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, index) => (
          <tr key={index}>
            {row.map((value, column) => (
              <td key={column} className={`${TD} num`}>
                {value ?? ''}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Skeleton({ lines = 3, height = 'h-3' }: { lines?: number; height?: string }) {
  return (
    <div className="space-y-2 p-3" aria-hidden>
      {Array.from({ length: lines }, (_, index) => (
        <div
          key={index}
          className={`${height} bg-panel2 rounded motion-safe:animate-pulse`}
          style={{ width: `${90 - index * 15}%` }}
        />
      ))}
    </div>
  );
}

/** A message people can act on, whatever the server sent. */
export function errorText(
  error: unknown,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string
): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return t('error.session');
    if (error.status === 403) return t('common.forbidden');
    if (error.status >= 500) return t('error.server');
    return error.message;
  }
  if (error instanceof TypeError) return t('error.network');
  return error instanceof Error ? error.message : String(error);
}

function StateBody({ state, children }: { state?: PanelState; children: React.ReactNode }) {
  const { t } = useI18n();
  if (state?.error) {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 px-3 py-6 text-center text-xs">
        <span className="text-bad flex items-center gap-1.5">
          <XOctagon size={14} aria-hidden />
          {t('common.loadFailed')}
        </span>
        <span className="text-fg2">{errorText(state.error, t)}</span>
        {state.error instanceof Error && state.error.message && (
          <details className="text-muted text-[11px]">
            <summary className="hover:text-fg cursor-pointer">{t('error.details')}</summary>
            <span className="mono mt-1 block">{state.error.message}</span>
          </details>
        )}
        {state.onRetry && (
          <button type="button" className={BUTTON} onClick={state.onRetry}>
            <RotateCw size={13} aria-hidden />
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  }
  if (state?.loading) {
    return (
      <>
        <span className="sr-only">{t('common.loading')}</span>
        <Skeleton />
      </>
    );
  }
  if (state?.empty) {
    return <p className="text-muted px-3 py-6 text-center text-xs">{t('common.noData')}</p>;
  }
  return <>{children}</>;
}

export function Panel({
  title,
  description,
  actions,
  className = '',
  bodyClassName = '',
  menu = true,
  data,
  csvName,
  state,
  children,
}: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  menu?: boolean;
  data?: TableData;
  csvName?: string;
  state?: PanelState;
  children: React.ReactNode | ((large: boolean) => React.ReactNode);
}) {
  const { t } = useI18n();
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    close: closeMenu,
    rootRef,
    triggerRef,
  } = usePopover();
  const [mode, setMode] = useState<'normal' | 'view' | 'data'>('normal');

  const body = (large: boolean) => (typeof children === 'function' ? children(large) : children);
  const choose = (next: 'view' | 'data') => {
    closeMenu(false);
    setMode(next);
  };

  return (
    <section className={`border-line bg-panel relative min-w-0 rounded-md border ${className}`}>
      {title && (
        <header className="flex h-9 items-center gap-1.5 px-3">
          <h2 className="text-fg truncate text-[13px] font-semibold">{title}</h2>
          {description && (
            <span className="group relative inline-flex" tabIndex={0} aria-label={description}>
              <Info size={13} aria-hidden className="text-muted" />
              <Tooltip text={description} align="start" />
            </span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {actions}
            {menu && (
              <div ref={rootRef} className="relative">
                <button
                  ref={triggerRef}
                  type="button"
                  aria-label={`${title} ${t('panel.menu')}`}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="text-muted hover:bg-panel2 hover:text-fg inline-flex h-7 w-7 items-center justify-center rounded transition-colors"
                >
                  <EllipsisVertical size={15} aria-hidden />
                </button>
                {menuOpen && (
                  <MenuList label={`${title} ${t('panel.menu')}`}>
                    <MenuItem icon={Maximize2} onSelect={() => choose('view')}>
                      {t('panel.view')}
                    </MenuItem>
                    {data && (
                      <MenuItem icon={Table2} onSelect={() => choose('data')}>
                        {t('panel.data')}
                      </MenuItem>
                    )}
                    {data && (
                      <MenuItem
                        icon={Download}
                        onSelect={() => {
                          closeMenu(true);
                          downloadCsv(csvName ?? 'panel.csv', toCsv(data.headers, data.rows));
                        }}
                      >
                        {t('panel.csv')}
                      </MenuItem>
                    )}
                  </MenuList>
                )}
              </div>
            )}
          </div>
        </header>
      )}
      {state?.staleError && (
        <div
          role="status"
          className="border-warn-line bg-warn-soft text-warn mx-3 mb-2 flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-xs"
        >
          <AlertTriangle size={13} aria-hidden />
          <span>{t('common.staleData')}</span>
          {state.onRetry && (
            <button
              type="button"
              className="rounded underline underline-offset-2"
              onClick={state.onRetry}
            >
              {t('common.retry')}
            </button>
          )}
        </div>
      )}
      <div className={bodyClassName}>
        <StateBody state={state}>{body(false)}</StateBody>
      </div>
      {mode !== 'normal' && title && (
        <Modal
          title={title}
          description={description}
          size="full"
          onClose={() => setMode('normal')}
        >
          {mode === 'view' ? (
            <StateBody state={state}>{body(true)}</StateBody>
          ) : (
            data && <DataTable data={data} />
          )}
        </Modal>
      )}
    </section>
  );
}

export function Row({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = usePersistentFlag(`studio-row-${id}`, true);
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <section className="mb-4" aria-labelledby={`row-${id}`}>
      <h2 id={`row-${id}`} className="mb-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="text-fg2 hover:text-fg flex h-7 items-center gap-1 rounded pr-2 text-[13px] font-semibold transition-colors"
        >
          <Icon size={15} aria-hidden />
          {title}
        </button>
      </h2>
      {open && children}
    </section>
  );
}

const SEVERITY_ICON = { ok: CheckCircle2, warn: AlertTriangle, bad: XOctagon };
const SEVERITY_TEXT = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad' };
const SEVERITY_MARK = { ok: '--c-good', warn: '--c-warning', bad: '--c-s2' };

export function severityMark(severity: Severity): string {
  return SEVERITY_MARK[severity];
}

export function SeverityIcon({ severity, size = 14 }: { severity: Severity; size?: number }) {
  const { t } = useI18n();
  const Icon = SEVERITY_ICON[severity];
  return (
    <span role="img" aria-label={t(`severity.${severity}` as MessageKey)} className="inline-flex">
      <Icon size={size} aria-hidden className={SEVERITY_TEXT[severity]} />
    </span>
  );
}

export function StatPanel({
  title,
  value,
  unit,
  severity,
  spark,
  color = '--c-s1',
  delta,
  description,
  actions,
  state,
}: {
  title: string;
  value: string;
  unit?: string;
  severity?: Severity;
  spark?: (number | null)[];
  color?: string;
  delta?: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
  state?: PanelState;
}) {
  return (
    <Panel
      title={title}
      description={description}
      actions={actions}
      state={state}
      data={
        spark
          ? { headers: ['#', title], rows: spark.map((point, index) => [index + 1, point]) }
          : undefined
      }
      csvName={`${title}.csv`}
    >
      {(large) => (
        <div className={`relative ${large ? 'h-96' : 'h-[88px]'}`}>
          <div
            className={`relative z-10 flex items-center gap-2 px-3 ${severity ? SEVERITY_TEXT[severity] : 'text-fg'}`}
          >
            {severity && <SeverityIcon severity={severity} size={20} />}
            <span
              className={`num leading-none font-medium tracking-tight ${large ? 'text-7xl' : 'text-[32px]'}`}
            >
              {value}
            </span>
            {unit && <span className="text-muted text-[15px]">{unit}</span>}
          </div>
          {delta && <div className="text-muted relative z-10 mt-1.5 px-3 text-xs">{delta}</div>}
          {spark && (
            <Sparkline
              values={spark}
              color={color}
              area
              stretch
              height={large ? 240 : 34}
              className="absolute inset-x-0 bottom-0"
            />
          )}
        </div>
      )}
    </Panel>
  );
}

export function WindowPicker<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
  label: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className="border-line-strong bg-panel2 inline-flex h-8 items-center rounded border p-0.5"
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === value}
          onClick={() => onChange(option)}
          className={`h-full rounded-sm px-2.5 text-xs transition-colors ${option === value ? 'bg-primary font-medium text-white' : 'text-fg2 hover:bg-line hover:text-fg'}`}
        >
          {t(`window.${option}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}

export function LiveStatus({ updatedAt, error }: { updatedAt: number | null; error: unknown }) {
  const { t, locale } = useI18n();
  const now = useNow();
  if (error && updatedAt) {
    return (
      <span
        role="status"
        className="border-warn-line bg-warn-soft text-warn inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px]"
      >
        <AlertTriangle size={12} aria-hidden />
        {t('common.refreshFailed', { time: formatClock(updatedAt) })}
      </span>
    );
  }
  if (!updatedAt || !now) return null;
  return (
    <span className="num text-muted text-[11px] whitespace-nowrap">
      {t('common.updated', { ago: formatAgo(updatedAt, now, locale) })}
    </span>
  );
}

export function Notice({
  tone = 'info',
  children,
  onClose,
}: {
  tone?: 'info' | 'ok' | 'bad' | 'warn';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const style = {
    bad: 'border-bad/50 bg-bad-soft text-bad',
    warn: 'border-warn-line bg-warn-soft text-warn',
    ok: 'border-ok/40 bg-ok-soft text-ok',
    info: 'border-line bg-panel2 text-fg2',
  }[tone];
  const Icon = { bad: XOctagon, warn: AlertTriangle, ok: CheckCircle2, info: Info }[tone];
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      aria-live={tone === 'bad' ? 'assertive' : 'polite'}
      className={`mb-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px] ${style}`}
    >
      <Icon size={15} aria-hidden className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="h-6 rounded px-1.5 text-xs underline-offset-2 hover:underline"
        >
          {t('common.dismiss')}
        </button>
      )}
    </div>
  );
}

/** One line under the header that says what the screen is for. */
export function PageIntro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h1 className="text-fg text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted mt-0.5 max-w-3xl text-[13px]">{children}</p>
    </div>
  );
}

export function Forbidden() {
  const { t } = useI18n();
  return <Notice tone="warn">{t('common.forbidden')}</Notice>;
}
