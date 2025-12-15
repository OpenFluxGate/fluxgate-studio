'use client';

import React from 'react';

import { Clock, Edit2, Key, Play, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { type Rule } from '../types';

import { Badge } from './Badge';
import { ScopeIcon } from './ScopeIcon';

interface RuleCardProps {
  rule: Rule;
  onEdit: (rule: Rule) => void;
  onSimulate: (rule: Rule) => void;
  onToggle: (id: string) => void;
  onDelete?: (id: string) => void;
}

export const RuleCard = ({ rule, onEdit, onSimulate, onToggle, onDelete }: RuleCardProps) => {
  const { theme } = useTheme();

  const policyColors: Record<string, 'danger' | 'warning' | 'info'> = {
    REJECT_REQUEST: 'danger',
    WAIT_FOR_REFILL: 'warning',
  };

  return (
    <div className="group relative">
      <div
        className={`absolute inset-0 bg-gradient-to-r ${theme.colors.gradientGlow} rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100`}
      />
      <div
        className={`relative ${theme.colors.bgCard} overflow-hidden rounded-xl border backdrop-blur transition-all duration-300 ${
          rule.enabled
            ? `${theme.colors.border} ${theme.colors.borderHover}`
            : `${theme.colors.borderSubtle} opacity-60`
        }`}
      >
        {rule.enabled && (
          <div
            className={`absolute top-0 right-0 left-0 h-px bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent`}
          />
        )}

        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold ${theme.colors.textPrimary} truncate`}>
                  {rule.name}
                </h3>
                <button onClick={() => onToggle(rule.id)} className="flex-shrink-0">
                  {rule.enabled ? (
                    <ToggleRight size={20} className={theme.colors.accent} />
                  ) : (
                    <ToggleLeft size={20} className={theme.colors.textMuted} />
                  )}
                </button>
              </div>
              <p className={`text-xs ${theme.colors.textMuted} mt-0.5 font-mono`}>{rule.id}</p>
            </div>
            <Badge variant={policyColors[rule.onLimitExceedPolicy]}>
              {rule.onLimitExceedPolicy.replace('_', ' ')}
            </Badge>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <div className={`flex items-center gap-1.5 text-xs ${theme.colors.textTertiary}`}>
              <ScopeIcon scope={rule.scope} />
              <span>{rule.scope}</span>
            </div>
            <span className={theme.colors.textMuted}>•</span>
            <div className={`flex items-center gap-1.5 text-xs ${theme.colors.textTertiary}`}>
              <Key size={12} />
              <span>{rule.keyStrategyId}</span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <p className={`text-xs ${theme.colors.textMuted} font-medium tracking-wider uppercase`}>
              Rate Bands
            </p>
            <div className="flex flex-wrap gap-2">
              {rule.bands.map((band, idx) => (
                <div
                  key={idx}
                  className={`flex items-center gap-2 px-2.5 py-1.5 ${theme.colors.bgTertiary} rounded-lg ${theme.colors.borderSubtle} border`}
                >
                  <Clock size={12} className={theme.colors.accent} />
                  <span className={`text-xs ${theme.colors.textSecondary} font-medium`}>
                    {band.capacity}
                  </span>
                  <span className={`text-xs ${theme.colors.textMuted}`}>/</span>
                  <span className={`text-xs ${theme.colors.textTertiary}`}>
                    {band.windowSeconds >= 3600
                      ? `${band.windowSeconds / 3600}h`
                      : band.windowSeconds >= 60
                        ? `${band.windowSeconds / 60}m`
                        : `${band.windowSeconds}s`}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {rule.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {rule.tags.map((tag) => (
                <span
                  key={tag}
                  className={`text-xs ${theme.colors.textMuted} ${theme.colors.bgTertiary} rounded px-2 py-0.5`}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          <div
            className={`mt-4 flex items-center justify-between pt-3 ${theme.colors.borderSubtle} border-t`}
          >
            <p className={`text-xs ${theme.colors.textMuted}`}>
              {rule.ruleSetId && (
                <>
                  Rule Set: <span className={theme.colors.textTertiary}>{rule.ruleSetId}</span>
                </>
              )}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onSimulate(rule)}
                className={`p-1.5 ${theme.colors.textMuted} ${theme.colors.accentBgLight} rounded-md transition-colors hover:opacity-80`}
                title="Simulate"
              >
                <Play size={14} />
              </button>
              <button
                onClick={() => onEdit(rule)}
                className={`p-1.5 ${theme.colors.textMuted} ${theme.colors.accentBgLight} rounded-md transition-colors hover:opacity-80`}
                title="Edit"
              >
                <Edit2 size={14} />
              </button>
              <button
                onClick={() => onDelete?.(rule.id)}
                className={`p-1.5 ${theme.colors.textMuted} ${theme.colors.dangerBg} rounded-md transition-colors hover:opacity-80`}
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
