'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
} from 'react';

import { consoleTheme } from '../data/themes';
import { type Theme } from '../types';

export type ColorMode = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  mode: ColorMode;
  setMode: (mode: ColorMode) => void;
}

const STORAGE_KEY = 'studio-color-mode';
const listeners = new Set<() => void>();
let chosenMode: ColorMode | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
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

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const mode = useSyncExternalStore(subscribe, readMode, () => 'dark' as ColorMode);

  useEffect(() => {
    const root = document.documentElement;
    if (mode === 'system') delete root.dataset.theme;
    else root.dataset.theme = mode;
  }, [mode]);

  const setMode = useCallback((next: ColorMode) => {
    chosenMode = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage can be blocked, the choice then lasts for this page only.
    }
    listeners.forEach((listener) => listener());
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: consoleTheme, mode, setMode }}>
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
