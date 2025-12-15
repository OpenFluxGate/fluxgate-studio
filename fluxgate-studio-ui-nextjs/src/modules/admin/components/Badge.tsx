'use client';

import React, { type ReactNode } from 'react';

import { useTheme } from '../contexts/ThemeContext';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export const Badge = ({ children, variant = 'default' }: BadgeProps) => {
  const { theme } = useTheme();

  const variants: Record<string, string> = {
    default: `${theme.colors.bgTertiary} ${theme.colors.textSecondary} ${theme.colors.border}`,
    success: `${theme.colors.successBg} ${theme.colors.success} ${theme.colors.successBorder}`,
    warning: `${theme.colors.warningBg} ${theme.colors.warning} ${theme.colors.warningBorder}`,
    danger: `${theme.colors.dangerBg} ${theme.colors.danger} ${theme.colors.dangerBorder}`,
    info: `${theme.colors.infoBg} ${theme.colors.info} ${theme.colors.infoBorder}`,
  };

  return (
    <span
      className={`inline-flex items-center rounded border px-2 py-0.5 text-xs font-medium ${variants[variant]}`}
    >
      {children}
    </span>
  );
};
