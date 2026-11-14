'use client';

import React, { useState } from 'react';

import { ChevronDown, Clock, Monitor, RefreshCw, ZoomOut } from 'lucide-react';

import {
  type DashboardState,
  PRESETS,
  rangeLabel,
  REFRESH_OPTIONS,
  type RefreshInterval,
  zoomOut,
} from '@/lib/timeRange';

import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';
import { BUTTON, INPUT } from './ui';

export function TimeRangePicker({
  state,
  onChange,
  onRefresh,
}: {
  state: DashboardState;
  onChange: (next: Partial<DashboardState>) => void;
  onRefresh: () => void;
}) {
  const { t, locale } = useI18n();
  const { setKiosk } = useKiosk();
  const [open, setOpen] = useState(false);
  const absolute = state.range.kind === 'absolute';

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        className={BUTTON}
        title={t('range.zoomOut')}
        aria-label={t('range.zoomOut')}
        onClick={() => onChange({ range: zoomOut(state.range, Date.now()) })}
      >
        <ZoomOut size={13} />
      </button>
      <div className="relative">
        <button
          type="button"
          className={BUTTON}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Clock size={13} />
          {rangeLabel(state.range, locale)}
          <ChevronDown size={12} />
        </button>
        {open && (
          <div
            className="border-line bg-panel2 absolute right-0 z-40 mt-1 w-44 rounded border py-1 text-xs shadow-lg"
            onMouseLeave={() => setOpen(false)}
          >
            {PRESETS.map((preset) => {
              const active = state.range.kind === 'relative' && state.range.preset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  className={`hover:bg-line block w-full px-3 py-1.5 text-left ${active ? 'text-s1 font-medium' : ''}`}
                  onClick={() => {
                    setOpen(false);
                    onChange({ range: { kind: 'relative', preset } });
                  }}
                >
                  {rangeLabel({ kind: 'relative', preset }, locale)}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button
        type="button"
        className={BUTTON}
        title={t('refresh.now')}
        aria-label={t('refresh.now')}
        onClick={onRefresh}
      >
        <RefreshCw size={13} />
      </button>
      <select
        aria-label={t('refresh.interval')}
        title={t('refresh.interval')}
        value={absolute ? 'off' : state.refresh}
        disabled={absolute}
        onChange={(event) => onChange({ refresh: event.target.value as RefreshInterval })}
        className={INPUT}
      >
        {REFRESH_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'off' ? t('refresh.off') : option}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={BUTTON}
        title={t('tv.enter')}
        aria-label={t('tv.enter')}
        onClick={() => setKiosk(true)}
      >
        <Monitor size={13} />
      </button>
    </div>
  );
}
