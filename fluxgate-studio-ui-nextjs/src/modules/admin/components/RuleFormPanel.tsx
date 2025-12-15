'use client';

import React, { useState } from 'react';

import { Edit2, Plus, Trash2, XCircle } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { type RateBand, type Rule } from '../types';

interface RuleFormPanelProps {
  rule: Rule | null;
  onClose: () => void;
  onSave: (data: Partial<Rule> & { id: string }) => void;
}

type FormData = {
  id: string;
  name: string;
  enabled: boolean;
  scope: Rule['scope'];
  keyStrategyId: string;
  onLimitExceedPolicy: Rule['onLimitExceedPolicy'];
  bands: RateBand[];
  tags: string[];
  ruleSetId: string;
};

export const RuleFormPanel = ({ rule, onClose, onSave }: RuleFormPanelProps) => {
  const { theme } = useTheme();
  const [formData, setFormData] = useState<FormData>(
    rule
      ? {
          id: rule.id,
          name: rule.name,
          enabled: rule.enabled,
          scope: rule.scope,
          keyStrategyId: rule.keyStrategyId,
          onLimitExceedPolicy: rule.onLimitExceedPolicy,
          bands: rule.bands,
          tags: rule.tags,
          ruleSetId: rule.ruleSetId || '',
        }
      : {
          id: '',
          name: '',
          enabled: true,
          scope: 'PER_IP',
          keyStrategyId: 'ip',
          onLimitExceedPolicy: 'REJECT_REQUEST',
          bands: [{ windowSeconds: 60, capacity: 100, label: '' }],
          tags: [],
          ruleSetId: '',
        }
  );

  const addBand = () => {
    setFormData({
      ...formData,
      bands: [...formData.bands, { windowSeconds: 60, capacity: 100, label: '' }],
    });
  };

  const removeBand = (idx: number) => {
    setFormData({
      ...formData,
      bands: formData.bands.filter((_, i) => i !== idx),
    });
  };

  const updateBand = (idx: number, field: keyof RateBand, value: string | number) => {
    const newBands = [...formData.bands];
    newBands[idx] = { ...newBands[idx], [field]: value };
    setFormData({ ...formData, bands: newBands });
  };

  return (
    <div
      className={`fixed inset-0 ${theme.colors.bgOverlay} z-50 flex items-center justify-center overflow-y-auto p-4 backdrop-blur-sm`}
    >
      <div
        className={`${theme.colors.bgSecondary} ${theme.colors.border} w-full max-w-4xl overflow-hidden rounded-2xl border ${theme.colors.shadow} my-4`}
      >
        <div
          className={`p-4 ${theme.colors.borderSubtle} border-b bg-gradient-to-r ${theme.colors.gradientGlow}`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 ${theme.colors.accentBgLight} rounded-lg`}>
                <Edit2 size={16} className={theme.colors.accent} />
              </div>
              <h2 className={`font-semibold ${theme.colors.textPrimary}`}>
                {rule ? 'Edit Rule' : 'New Rule'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className={`${theme.colors.textMuted} transition-colors hover:opacity-80`}
            >
              <XCircle size={20} />
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-2 divide-x ${theme.colors.border}`}>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>
                  Rule ID {rule && <span className={theme.colors.textMuted}>(read-only)</span>}
                </label>
                <input
                  type="text"
                  value={formData.id}
                  onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                  disabled={!!rule}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus} font-mono ${rule ? 'cursor-not-allowed opacity-60' : ''}`}
                  placeholder="api-limits"
                />
              </div>
              <div>
                <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                  placeholder="Public API Limits"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>Scope</label>
                <select
                  value={formData.scope}
                  onChange={(e) =>
                    setFormData({ ...formData, scope: e.target.value as Rule['scope'] })
                  }
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                >
                  <option value="PER_IP">PER_IP</option>
                  <option value="PER_USER">PER_USER</option>
                  <option value="PER_API_KEY">PER_API_KEY</option>
                  <option value="GLOBAL">GLOBAL</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
              </div>
              <div>
                <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>
                  Key Strategy
                </label>
                <select
                  value={formData.keyStrategyId}
                  onChange={(e) => setFormData({ ...formData, keyStrategyId: e.target.value })}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                >
                  <option value="ip">ip</option>
                  <option value="userId">userId</option>
                  <option value="apiKey">apiKey</option>
                  <option value="custom">custom</option>
                </select>
              </div>
            </div>

            <div>
              <label className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}>
                On Limit Exceed Policy
              </label>
              <select
                value={formData.onLimitExceedPolicy}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    onLimitExceedPolicy: e.target.value as Rule['onLimitExceedPolicy'],
                  })
                }
                className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
              >
                <option value="REJECT_REQUEST">REJECT_REQUEST (429)</option>
                <option value="WAIT_FOR_REFILL">WAIT_FOR_REFILL (Delay)</option>
              </select>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className={`text-xs ${theme.colors.textTertiary}`}>Rate Bands</label>
                <button
                  onClick={addBand}
                  className={`flex items-center gap-1 text-xs ${theme.colors.accent}`}
                >
                  <Plus size={12} /> Add Band
                </button>
              </div>
              <div className="space-y-2">
                {formData.bands.map((band, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 p-3 ${theme.colors.bgTertiary} rounded-lg ${theme.colors.borderSubtle} border`}
                  >
                    <div className="grid flex-1 grid-cols-3 gap-2">
                      <div>
                        <label className={`block text-[10px] ${theme.colors.textMuted} mb-1`}>
                          Window (sec)
                        </label>
                        <input
                          type="number"
                          value={band.windowSeconds}
                          onChange={(e) =>
                            updateBand(idx, 'windowSeconds', parseInt(e.target.value))
                          }
                          className={`w-full px-2 py-1.5 ${theme.colors.bgInput} ${theme.colors.border} rounded border text-xs ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-[10px] ${theme.colors.textMuted} mb-1`}>
                          Capacity
                        </label>
                        <input
                          type="number"
                          value={band.capacity}
                          onChange={(e) => updateBand(idx, 'capacity', parseInt(e.target.value))}
                          className={`w-full px-2 py-1.5 ${theme.colors.bgInput} ${theme.colors.border} rounded border text-xs ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-[10px] ${theme.colors.textMuted} mb-1`}>
                          Label
                        </label>
                        <input
                          type="text"
                          value={band.label}
                          onChange={(e) => updateBand(idx, 'label', e.target.value)}
                          className={`w-full px-2 py-1.5 ${theme.colors.bgInput} ${theme.colors.border} rounded border text-xs ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                          placeholder="100-per-min"
                        />
                      </div>
                    </div>
                    {formData.bands.length > 1 && (
                      <button
                        onClick={() => removeBand(idx)}
                        className={`p-1.5 ${theme.colors.textMuted} rounded hover:opacity-80`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className={`flex-1 py-2.5 ${theme.colors.bgTertiary} hover:opacity-80 ${theme.colors.textSecondary} rounded-lg font-medium transition-colors`}
              >
                Cancel
              </button>
              <button
                onClick={() => onSave(formData)}
                className={`flex-1 bg-gradient-to-r py-2.5 ${theme.colors.gradientPrimary} rounded-lg font-medium text-white transition-all hover:opacity-90 ${theme.colors.shadowAccent}`}
              >
                Save Rule
              </button>
            </div>
          </div>

          <div className={`p-4 ${theme.colors.bg}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className={`text-xs ${theme.colors.textMuted} tracking-wider uppercase`}>
                JSON Preview
              </span>
              <button className={`text-xs ${theme.colors.accent}`}>Copy</button>
            </div>
            <pre
              className={`text-xs ${theme.colors.textSecondary} font-mono ${theme.colors.bgTertiary} max-h-[60vh] overflow-auto rounded-lg p-3 ${theme.colors.border} border`}
            >
              {JSON.stringify(formData, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
