'use client';

import React from 'react';

import { formatAgo, formatClock } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { useI18n } from './I18nProvider';
import { useNow } from './useLive';

export const TH = 'border-b border-line px-2 py-1.5 text-left text-[11px] font-medium text-muted';
export const TD = 'border-b border-line/60 px-2 py-1.5 align-top';
export const BUTTON =
  'inline-flex items-center gap-1 rounded border border-line-strong bg-panel px-2 py-1 text-xs text-fg hover:bg-panel2 disabled:opacity-50';
export const BUTTON_PRIMARY =
  'inline-flex items-center gap-1 rounded bg-fg px-2.5 py-1 text-xs font-medium text-panel hover:opacity-90 disabled:opacity-50';
export const INPUT =
  'rounded border border-line-strong bg-panel px-2 py-1 text-xs text-fg placeholder:text-faint focus:border-fg focus:outline-none';

export function Panel({
  title,
  actions,
  className = '',
  children,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`border-line bg-panel rounded border ${className}`}>
      {title && (
        <header className="border-line text-muted flex items-center justify-between border-b px-3 py-1.5 text-[11px] font-medium">
          <span>{title}</span>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <h1 className="text-sm font-semibold">{title}</h1>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="border-line bg-panel rounded border px-3 py-2">
      <div className="text-muted text-[11px]">{label}</div>
      <div className={`num text-lg leading-7 ${tone === 'bad' ? 'text-bad' : 'text-fg'}`}>
        {value}
      </div>
    </div>
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
    <div className="border-line-strong bg-panel inline-flex rounded border p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={option === value}
          className={`rounded-sm px-2 py-0.5 text-xs ${option === value ? 'bg-fg text-panel' : 'text-fg2 hover:bg-panel2'}`}
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
