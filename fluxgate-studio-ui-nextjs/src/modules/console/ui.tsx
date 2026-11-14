'use client';

import React, { useEffect, useState } from 'react';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  EllipsisVertical,
  Maximize2,
  Table2,
  XOctagon,
} from 'lucide-react';

import { downloadCsv, toCsv } from '@/lib/csv';
import { formatAgo, formatClock } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';
import { type Severity } from '@/lib/stats';

import { Sparkline } from './charts';
import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';
import { usePersistentFlag } from './persistentFlag';
import { useNow } from './useLive';

export const TH = 'border-b border-line px-2 py-1.5 text-left text-[11px] font-medium text-s1';
export const TD = 'border-b border-line/60 px-2 py-1.5 align-top';
export const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line-strong bg-panel2 px-2 py-1 text-xs text-fg hover:border-fg2 disabled:opacity-50';
export const BUTTON_PRIMARY =
  'inline-flex items-center gap-1 rounded bg-s1 px-2.5 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50';
export const INPUT =
  'rounded border border-line-strong bg-panel2 px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-s1 focus:outline-none';

export interface TableData {
  headers: string[];
  rows: (string | number | null)[][];
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  const { kiosk } = useKiosk();
  if (kiosk) return null;
  return (
    <div className="border-line bg-panel sticky top-0 z-30 -mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-2 border-b px-4 py-2">
      <div className="text-muted text-xs">
        FluxGate<span className="mx-1.5">›</span>
        <span className="text-fg font-medium">{title}</span>
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function DataTable({ data }: { data: TableData }) {
  return (
    <table className="w-full">
      <thead>
        <tr>
          {data.headers.map((header) => (
            <th key={header} className={TH}>
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

function MenuItem({
  icon: Icon,
  onClick,
  children,
}: {
  icon: typeof Maximize2;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-line flex w-full items-center gap-2 px-3 py-1.5 text-left"
    >
      <Icon size={13} />
      {children}
    </button>
  );
}

export function Panel({
  title,
  actions,
  className = '',
  bodyClassName = '',
  data,
  csvName,
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  data?: TableData;
  csvName?: string;
  children: React.ReactNode | ((large: boolean) => React.ReactNode);
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'normal' | 'view' | 'data'>('normal');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (mode === 'normal') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMode('normal');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  const body = (large: boolean) => (typeof children === 'function' ? children(large) : children);
  const choose = (next: 'view' | 'data') => {
    setMenuOpen(false);
    setMode(next);
  };

  return (
    <section className={`border-line bg-panel relative rounded border ${className}`}>
      {title && (
        <header className="text-fg flex items-center gap-2 px-3 py-1.5 text-xs font-medium">
          <span className="truncate">{title}</span>
          <div className="ml-auto flex items-center gap-1">
            {actions}
            <div className="relative">
              <button
                type="button"
                aria-label={t('panel.menu')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen(!menuOpen)}
                className="text-muted hover:bg-panel2 hover:text-fg rounded px-0.5"
              >
                <EllipsisVertical size={14} />
              </button>
              {menuOpen && (
                <div
                  className="border-line bg-panel2 absolute right-0 z-40 mt-1 w-40 rounded border py-1 text-xs font-normal shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <MenuItem icon={Maximize2} onClick={() => choose('view')}>
                    {t('panel.view')}
                  </MenuItem>
                  {data && (
                    <MenuItem icon={Table2} onClick={() => choose('data')}>
                      {t('panel.data')}
                    </MenuItem>
                  )}
                  {data && (
                    <MenuItem
                      icon={Download}
                      onClick={() => {
                        setMenuOpen(false);
                        downloadCsv(csvName ?? 'panel.csv', toCsv(data.headers, data.rows));
                      }}
                    >
                      {t('panel.csv')}
                    </MenuItem>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
      )}
      <div className={bodyClassName}>{body(false)}</div>
      {mode !== 'normal' && (
        <div className="bg-bg fixed inset-0 z-50 flex flex-col p-6" role="dialog" aria-modal>
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold">{title}</h2>
            <button type="button" className={`${BUTTON} ml-auto`} onClick={() => setMode('normal')}>
              {t('common.close')}
            </button>
          </div>
          <div className="border-line bg-panel min-h-0 flex-1 overflow-auto rounded border p-3">
            {mode === 'view' ? body(true) : data && <DataTable data={data} />}
          </div>
        </div>
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
    <div className="mb-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="text-fg2 hover:text-fg mb-1.5 flex items-center gap-1 text-xs font-medium"
      >
        <Icon size={14} />
        {title}
      </button>
      {open && children}
    </div>
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
    <Icon
      size={size}
      role="img"
      aria-label={t(`severity.${severity}` as MessageKey)}
      className={SEVERITY_TEXT[severity]}
    />
  );
}

export function StatPanel({
  title,
  value,
  unit,
  severity,
  spark,
  color = '--c-s1',
}: {
  title: string;
  value: string;
  unit?: string;
  severity?: Severity;
  spark?: number[];
  color?: string;
}) {
  return (
    <Panel
      title={title}
      data={
        spark
          ? { headers: ['#', title], rows: spark.map((point, index) => [index + 1, point]) }
          : undefined
      }
      csvName={`${title}.csv`}
    >
      {(large) => (
        <div className={`relative ${large ? 'h-96' : 'h-16'}`}>
          <div
            className={`relative z-10 flex items-center gap-1.5 px-3 ${severity ? SEVERITY_TEXT[severity] : 'text-fg'}`}
          >
            {severity && <SeverityIcon severity={severity} size={18} />}
            <span className={`num leading-9 ${large ? 'text-6xl' : 'text-2xl'}`}>{value}</span>
            {unit && <span className="text-muted text-sm">{unit}</span>}
          </div>
          {spark && (
            <Sparkline
              values={spark}
              color={color}
              area
              stretch
              height={large ? 240 : 36}
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
}: {
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="border-line-strong bg-panel2 inline-flex rounded border p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`rounded-sm px-2 py-0.5 text-xs ${option === value ? 'bg-s1 text-white' : 'text-fg2 hover:bg-line'}`}
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
      <span className="border-warn-line bg-warn-soft text-warn rounded border px-2 py-0.5 text-[11px]">
        {t('common.refreshFailed', { time: formatClock(updatedAt) })}
      </span>
    );
  }
  if (!updatedAt || !now) return null;
  return (
    <span className="text-muted text-[11px]">
      {t('common.updated', { ago: formatAgo(updatedAt, now, locale) })}
    </span>
  );
}

export function Notice({
  tone = 'info',
  children,
  onClose,
}: {
  tone?: 'info' | 'bad' | 'warn';
  children: React.ReactNode;
  onClose?: () => void;
}) {
  const { t } = useI18n();
  const style =
    tone === 'bad'
      ? 'border-bad bg-bad-soft text-bad'
      : tone === 'warn'
        ? 'border-warn-line bg-warn-soft text-warn'
        : 'border-line bg-panel2 text-fg2';
  return (
    <div className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 text-xs ${style}`}>
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="text-[11px] underline">
          {t('common.dismiss')}
        </button>
      )}
    </div>
  );
}

export function Forbidden() {
  const { t } = useI18n();
  return <Notice tone="warn">{t('common.forbidden')}</Notice>;
}
