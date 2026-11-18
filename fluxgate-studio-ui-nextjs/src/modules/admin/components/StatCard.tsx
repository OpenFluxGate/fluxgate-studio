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
    <div className="studio-stat">
      <div
        className={`relative ${theme.colors.bgCard} ${theme.colors.border} rounded-lg border p-4 ${theme.colors.borderHover} transition-all duration-300`}
      >
        <div className="studio-stat-icon flex items-start justify-between">
          <div className={`p-2 ${theme.colors.bgTertiary} rounded-lg`}>
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
        <div className="studio-stat-value mt-3">
          <p
            className={`text-3xl font-semibold tabular-nums ${theme.colors.textPrimary} tracking-tight`}
          >
            {value}
          </p>
          <p className={`text-xs ${theme.colors.textSecondary} mt-1`}>{label}</p>
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
