'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';

import { ChevronDown, LogOut, Settings } from 'lucide-react';

import { type Locale, type MessageKey } from '@/lib/i18n';
import { type ColorMode, useTheme } from '@/modules/admin';

import { MenuDivider, MenuItem, MenuLabel, MenuList, usePopover } from './controls';
import { useI18n } from './I18nProvider';
import { useMe } from './MeProvider';

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
];
const MODES: ColorMode[] = ['dark', 'light', 'system'];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
}

export function UserMenu() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const { me } = useMe();
  const router = useRouter();
  const { open: menuOpen, setOpen: setMenuOpen, rootRef, triggerRef } = usePopover();
  const name = me ? me.name || me.username : '…';
  const role = me ? t(me.canWrite ? 'role.admin' : 'role.viewer') : '';

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${t('user.menu')}: ${name} ${role}`}
        onClick={() => setMenuOpen(!menuOpen)}
        className="hover:bg-panel2 flex h-8 items-center gap-2 rounded px-1.5 transition-colors"
      >
        <span
          aria-hidden
          className="bg-s1 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white"
        >
          {me ? initials(name) : ''}
        </span>
        <span className="hidden flex-col items-start leading-tight lg:flex">
          <span className="text-fg max-w-32 truncate text-xs">{name}</span>
          <span className="text-muted text-[11px]">{role}</span>
        </span>
        <ChevronDown size={13} aria-hidden className="text-muted" />
      </button>
      {menuOpen && (
        <MenuList label={t('user.menu')} width="w-56">
          <div className="border-line border-b px-3 pt-1 pb-2">
            <div className="text-fg truncate text-[13px] font-medium">{name}</div>
            <div className="text-muted text-[11px]">
              {me?.username} · {role}
            </div>
          </div>
          <MenuLabel>{t('nav.language')}</MenuLabel>
          {LOCALES.map((option) => (
            <MenuItem
              key={option.value}
              checked={locale === option.value}
              onSelect={() => setLocale(option.value)}
            >
              {option.label}
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuLabel>{t('nav.theme')}</MenuLabel>
          {MODES.map((option) => (
            <MenuItem key={option} checked={mode === option} onSelect={() => setMode(option)}>
              {t(`mode.${option}` as MessageKey)}
            </MenuItem>
          ))}
          <MenuDivider />
          <MenuItem
            icon={Settings}
            onSelect={() => {
              setMenuOpen(false);
              router.push('/settings');
            }}
          >
            {t('nav.settings')}
          </MenuItem>
          <MenuDivider />
          <MenuItem icon={LogOut} onSelect={() => signOut({ callbackUrl: '/login' })}>
            {t('common.signOut')}
          </MenuItem>
        </MenuList>
      )}
    </div>
  );
}
