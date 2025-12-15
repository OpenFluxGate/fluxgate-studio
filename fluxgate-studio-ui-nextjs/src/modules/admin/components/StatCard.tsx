'use client';

import React from 'react';

import { type LucideIcon } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subValue?: string;
  trend?: number;
}

export const StatCard = ({ icon: Icon, label, value, subValue, trend }: StatCardProps) => {
  const { theme } = useTheme();

  return (
    <div className="group relative">
      <div
        className={`absolute inset-0 bg-gradient-to-r ${theme.colors.gradientGlow} rounded-xl opacity-0 blur-xl transition-opacity duration-500 group-hover:opacity-100`}
      />
      <div
        className={`relative ${theme.colors.bgCard} backdrop-blur ${theme.colors.border} rounded-xl border p-4 ${theme.colors.borderHover} transition-all duration-300`}
      >
        <div className="flex items-start justify-between">
          <div className={`bg-gradient-to-br p-2 ${theme.colors.gradientGlow} rounded-lg`}>
            <Icon size={18} className={theme.colors.accent} />
          </div>
          {trend !== undefined && (
            <span
              className={`text-xs font-medium ${trend > 0 ? theme.colors.success : theme.colors.danger}`}
            >
              {trend > 0 ? '+' : ''}
              {trend}%
            </span>
          )}
        </div>
        <div className="mt-3">
          <p className={`text-2xl font-bold ${theme.colors.textPrimary} tracking-tight`}>{value}</p>
          <p className={`text-xs ${theme.colors.textMuted} mt-0.5`}>{label}</p>
        </div>
        {subValue && (
          <p
            className={`text-xs ${theme.colors.textTertiary} mt-2 pt-2 ${theme.colors.borderSubtle} border-t`}
          >
            {subValue}
          </p>
        )}
      </div>
    </div>
  );
};
