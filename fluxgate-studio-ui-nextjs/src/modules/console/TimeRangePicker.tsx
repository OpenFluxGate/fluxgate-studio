'use client';

import React from 'react';

import { ChevronDown, Clock, Monitor, RefreshCw, ZoomOut } from 'lucide-react';

import {
  type DashboardState,
  PRESETS,
  rangeLabel,
  REFRESH_OPTIONS,
  type RefreshInterval,
  zoomOut,
} from '@/lib/timeRange';

import { BUTTON, IconButton, INPUT, MenuItem, MenuList, usePopover } from './controls';
import { useI18n } from './I18nProvider';
import { useKiosk } from './kiosk';

/**
 * Time range button with a menu of choices. Every screen with a time range uses it in its header,
 * so the control looks and behaves the same everywhere.
 */
export function RangeMenu<T extends string>({
  label,
  value,
  options,
  format,
  onChange,
  display,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  format: (option: T) => string;
  onChange: (option: T) => void;
  display?: string;
}) {
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    close: closeMenu,
    rootRef,
    triggerRef,
  } = usePopover();
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={BUTTON}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${label}: ${display ?? (value ? format(value) : '')}`}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        <Clock size={14} aria-hidden />
        <span className="num">{display ?? (value ? format(value) : '')}</span>
        <ChevronDown size={13} aria-hidden />
      </button>
      {menuOpen && (
        <MenuList label={label}>
          {options.map((option) => (
            <MenuItem
              key={option}
              checked={value === option}
              onSelect={() => {
                closeMenu(true);
                onChange(option);
              }}
            >
              {format(option)}
            </MenuItem>
          ))}
        </MenuList>
      )}
    </div>
  );
}

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
  const absolute = state.range.kind === 'absolute';

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        label={t('range.zoomOut')}
        icon={ZoomOut}
        onClick={() => onChange({ range: zoomOut(state.range, Date.now()) })}
      />
      <RangeMenu
        label={t('audit.period')}
        value={state.range.kind === 'relative' ? state.range.preset : null}
        options={PRESETS}
        display={rangeLabel(state.range, locale)}
        format={(preset) => rangeLabel({ kind: 'relative', preset }, locale)}
        onChange={(preset) => onChange({ range: { kind: 'relative', preset } })}
      />
      <IconButton label={t('refresh.now')} icon={RefreshCw} onClick={onRefresh} />
      <label className="sr-only" htmlFor="refresh-interval">
        {t('refresh.interval')}
      </label>
      <select
        id="refresh-interval"
        name="refresh"
        title={t('refresh.interval')}
        value={absolute ? 'off' : state.refresh}
        disabled={absolute}
        onChange={(event) => onChange({ refresh: event.target.value as RefreshInterval })}
        className={`${INPUT} w-[4.5rem] pr-1`}
      >
        {REFRESH_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option === 'off' ? t('refresh.off') : option}
          </option>
        ))}
      </select>
      <IconButton label={t('tv.enter')} icon={Monitor} onClick={() => setKiosk(true)} align="end" />
    </div>
  );
}
