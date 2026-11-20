'use client';

import React, { createContext, useCallback, useContext, useSyncExternalStore } from 'react';

import { consoleTheme } from '../data/themes';
import { type Theme } from '../types';

export type ColorMode = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ColorMode;
  resolved: ResolvedTheme;
  setMode: (mode: ColorMode) => void;
}

const STORAGE_KEY = 'studio-color-mode';
const DARK_QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
let chosenMode: ColorMode | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia(DARK_QUERY);
  media.addEventListener('change', listener);
  return () => {
    listeners.delete(listener);
    media.removeEventListener('change', listener);
  };
}

function readMode(): ColorMode {
  if (chosenMode) return chosenMode;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'system' ? value : 'dark';
  } catch {
    return 'dark';
  }
}

function resolve(mode: ColorMode): ResolvedTheme {
  if (mode !== 'system') return mode;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

function applyMode(mode: ColorMode) {
  const root = document.documentElement;
  if (mode === 'system') delete root.dataset.theme;
  else root.dataset.theme = mode;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'dark' as ColorMode);
  const resolved = useSyncExternalStore(
    subscribe,
    () => resolve(readMode()),
    () => 'dark' as ResolvedTheme
  );

  const setMode = useCallback((next: ColorMode) => {
    chosenMode = next;
    // The attribute changes before listeners run, so charts read the new colors when they redraw.
    applyMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked, the choice then lasts for this page only.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: consoleTheme, mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
