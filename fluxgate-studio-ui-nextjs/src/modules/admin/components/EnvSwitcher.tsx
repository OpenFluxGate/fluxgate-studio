'use client';

import React from 'react';

import { useTheme } from '../contexts/ThemeContext';

interface EnvSwitcherProps {
  currentEnv: string;
  onChange: (env: string) => void;
}

export const EnvSwitcher = ({ currentEnv, onChange }: EnvSwitcherProps) => {
  const { theme } = useTheme();
  const envs = ['dev', 'stage', 'prod'];

  return (
    <div className={`flex ${theme.colors.bgTertiary} rounded-lg p-1 ${theme.colors.border} border`}>
      {envs.map((env) => (
        <button
          key={env}
          onClick={() => onChange(env)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
            currentEnv === env
              ? env === 'prod'
                ? `bg-gradient-to-r from-cyan-500 to-teal-500 text-white ${theme.colors.shadowAccent}`
                : env === 'stage'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                  : 'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-lg shadow-violet-500/20'
              : `${theme.colors.textTertiary} ${theme.colors.bgCardHover}`
          }`}
        >
          {env.toUpperCase()}
        </button>
      ))}
    </div>
  );
};
