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
  const {
    open: menuOpen,
    setOpen: setMenuOpen,
    close: closeMenu,
    rootRef,
    triggerRef,
  } = usePopover();
  const absolute = state.range.kind === 'absolute';

  return (
    <div className="flex items-center gap-1.5">
      <IconButton
        label={t('range.zoomOut')}
        icon={ZoomOut}
        onClick={() => onChange({ range: zoomOut(state.range, Date.now()) })}
      />
      <div ref={rootRef} className="relative">
        <button
          ref={triggerRef}
          type="button"
          className={BUTTON}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Clock size={14} aria-hidden />
          <span className="num">{rangeLabel(state.range, locale)}</span>
          <ChevronDown size={13} aria-hidden />
        </button>
        {menuOpen && (
          <MenuList label={t('audit.period')}>
            {PRESETS.map((preset) => (
              <MenuItem
                key={preset}
                checked={state.range.kind === 'relative' && state.range.preset === preset}
                onSelect={() => {
                  closeMenu(true);
                  onChange({ range: { kind: 'relative', preset } });
                }}
              >
                {rangeLabel({ kind: 'relative', preset }, locale)}
              </MenuItem>
            ))}
          </MenuList>
        )}
      </div>
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
