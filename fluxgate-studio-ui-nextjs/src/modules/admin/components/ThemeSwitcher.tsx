'use client';

import React, { useState } from 'react';

import { Monitor, Moon, Sun } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';

export const ThemeSwitcher = () => {
  const { themeName, setThemeName, theme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);

  const options = [
    { id: 'light', name: 'Light', icon: Sun },
    { id: 'dark', name: 'Dark', icon: Moon },
    { id: 'midnight', name: 'Midnight', icon: Moon },
    { id: 'system', name: 'System', icon: Monitor },
  ];

  const currentOption = options.find((o) => o.id === themeName) || options[1];
  const CurrentIcon = currentOption.icon;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`rounded-lg p-2 transition-colors ${theme.colors.textTertiary} ${theme.colors.bgCardHover}`}
      >
        <CurrentIcon size={18} />
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
          <div
            className={`absolute top-full right-0 mt-2 w-40 ${theme.colors.bgSecondary} ${theme.colors.border} rounded-xl border ${theme.colors.shadow} z-50 overflow-hidden`}
          >
            {options.map((option) => {
              const Icon = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    setThemeName(option.id);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${
                    themeName === option.id
                      ? `${theme.colors.accentBgLight} ${theme.colors.accent}`
                      : `${theme.colors.textSecondary} ${theme.colors.bgCardHover}`
                  }`}
                >
                  <Icon size={14} />
                  {option.name}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};
