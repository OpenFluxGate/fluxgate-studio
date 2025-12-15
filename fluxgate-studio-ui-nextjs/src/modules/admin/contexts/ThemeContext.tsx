'use client';

import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useSyncExternalStore,
} from 'react';

import { themes } from '../data/themes';
import { type Theme } from '../types';

interface ThemeContextValue {
  theme: Theme;
  themeName: string;
  setThemeName: (name: string) => void;
  themes: Record<string, Theme>;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

interface ThemeProviderProps {
  children: ReactNode;
}

// Custom hook to safely access system color scheme
function useSystemTheme(): string {
  const subscribe = useCallback((callback: () => void) => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQuery.addEventListener('change', callback);
    return () => mediaQuery.removeEventListener('change', callback);
  }, []);

  const getSnapshot = useCallback(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }, []);

  const getServerSnapshot = useCallback(() => 'light', []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [themeName, setThemeNameState] = React.useState('light');
  const systemTheme = useSystemTheme();

  const setThemeName = useCallback((name: string) => {
    setThemeNameState(name);
  }, []);

  const currentTheme = themeName === 'system' ? systemTheme : themeName;
  const theme = themes[currentTheme] || themes.light;

  return (
    <ThemeContext.Provider value={{ theme, themeName, setThemeName, themes }}>
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
