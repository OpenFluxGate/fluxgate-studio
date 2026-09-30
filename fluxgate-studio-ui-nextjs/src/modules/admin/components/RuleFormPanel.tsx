'use client';

import React, { useState } from 'react';

import { Edit2, Plus, Trash2, XCircle } from 'lucide-react';

import { useTheme } from '../contexts/ThemeContext';
import { type FieldErrors, type RateBand, type Rule } from '../types';

interface RuleFormPanelProps {
  rule: Rule | null;
  onClose: () => void;
  onSave: (data: Partial<Rule> & { id: string }) => void;
  /** Per-field messages returned by the server, keyed the same way as client-side errors. */
  serverErrors?: FieldErrors;
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
  version: number;
};

/** Mirrors the server side `@Pattern` on `CreateRuleRequest.id`. */
const RULE_ID_PATTERN = /^[a-zA-Z0-9-_]+$/;

/**
 * Client-side validation mirroring the Bean Validation constraints of the Admin API, so the common
 * mistakes are caught before a round trip.
 */
export function validateRule(formData: FormData): FieldErrors {
  const errors: FieldErrors = {};

  if (!formData.id.trim()) {
    errors.id = 'id is required';
  } else if (!RULE_ID_PATTERN.test(formData.id)) {
    errors.id = 'id must contain only alphanumeric characters, hyphens, and underscores';
  }

  if (!formData.name.trim()) {
    errors.name = 'name is required';
  }

  if (formData.bands.length === 0) {
    errors.bands = 'bands must not be empty';
  }

  const seenWindows = new Set<number>();
  formData.bands.forEach((band, index) => {
    if (!Number.isFinite(band.windowSeconds) || band.windowSeconds < 1) {
      errors[`bands[${index}].windowSeconds`] = 'windowSeconds must be at least 1';
    } else if (seenWindows.has(band.windowSeconds)) {
      errors[`bands[${index}].windowSeconds`] =
        `duplicate band window: ${band.windowSeconds} seconds`;
    } else {
      seenWindows.add(band.windowSeconds);
    }

    if (!Number.isFinite(band.capacity) || band.capacity < 1) {
      errors[`bands[${index}].capacity`] = 'capacity must be at least 1';
    }
  });

  return errors;
}

export const RuleFormPanel = ({ rule, onClose, onSave, serverErrors }: RuleFormPanelProps) => {
  const { theme } = useTheme();
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  // Server messages describe the payload that was submitted, so they are dropped as soon as the
  // operator starts editing again.
  const [serverErrorsStale, setServerErrorsStale] = useState(false);
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
          version: rule.version,
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
          version: 0,
        }
  );

  const errors: FieldErrors = {
    ...(serverErrorsStale ? {} : (serverErrors ?? {})),
    ...clientErrors,
  };

  const updateForm = (next: FormData) => {
    setFormData(next);
    setServerErrorsStale(true);
  };

  const addBand = () => {
    updateForm({
      ...formData,
      bands: [...formData.bands, { windowSeconds: 60, capacity: 100, label: '' }],
    });
  };

  const removeBand = (idx: number) => {
    updateForm({
      ...formData,
      bands: formData.bands.filter((_, i) => i !== idx),
    });
  };

  const updateBand = (idx: number, field: keyof RateBand, value: string | number) => {
    const newBands = [...formData.bands];
    newBands[idx] = { ...newBands[idx], [field]: value };
    updateForm({ ...formData, bands: newBands });
  };

  const handleSave = () => {
    const validationErrors = validateRule(formData);
    setClientErrors(validationErrors);
    if (Object.keys(validationErrors).length === 0) {
      // Let the messages of the upcoming round trip through again.
      setServerErrorsStale(false);
      onSave(formData);
    }
  };

  const fieldError = (name: string) =>
    errors[name] ? (
      <p className={`mt-1 text-[11px] ${theme.colors.danger}`} role="alert">
        {errors[name]}
      </p>
    ) : null;

  const inputBorder = (name: string) =>
    errors[name] ? theme.colors.dangerBorder : theme.colors.border;

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
              type="button"
              onClick={onClose}
              aria-label="Close"
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
                <label
                  htmlFor="rule-id"
                  className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
                >
                  Rule ID {rule && <span className={theme.colors.textMuted}>(read-only)</span>}
                </label>
                <input
                  id="rule-id"
                  type="text"
                  value={formData.id}
                  onChange={(e) => updateForm({ ...formData, id: e.target.value })}
                  disabled={!!rule}
                  aria-invalid={!!errors.id}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${inputBorder('id')} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus} font-mono ${rule ? 'cursor-not-allowed opacity-60' : ''}`}
                  placeholder="api-limits"
                />
                {fieldError('id')}
              </div>
              <div>
                <label
                  htmlFor="rule-name"
                  className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
                >
                  Name
                </label>
                <input
                  id="rule-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => updateForm({ ...formData, name: e.target.value })}
                  aria-invalid={!!errors.name}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${inputBorder('name')} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                  placeholder="Public API Limits"
                />
                {fieldError('name')}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="rule-scope"
                  className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
                >
                  Scope
                </label>
                <select
                  id="rule-scope"
                  value={formData.scope}
                  onChange={(e) =>
                    updateForm({ ...formData, scope: e.target.value as Rule['scope'] })
                  }
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                >
                  <option value="PER_IP">PER_IP</option>
                  <option value="PER_USER">PER_USER</option>
                  <option value="PER_API_KEY">PER_API_KEY</option>
                  <option value="GLOBAL">GLOBAL</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
                {fieldError('scope')}
              </div>
              <div>
                <label
                  htmlFor="rule-key-strategy"
                  className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
                >
                  Key Strategy
                </label>
                <select
                  id="rule-key-strategy"
                  value={formData.keyStrategyId}
                  onChange={(e) => updateForm({ ...formData, keyStrategyId: e.target.value })}
                  className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                >
                  <option value="ip">ip</option>
                  <option value="userId">userId</option>
                  <option value="apiKey">apiKey</option>
                  <option value="custom">custom</option>
                </select>
                {fieldError('keyStrategyId')}
              </div>
            </div>

            <div>
              <label
                htmlFor="rule-policy"
                className={`block text-xs ${theme.colors.textTertiary} mb-1.5`}
              >
                On Limit Exceed Policy
              </label>
              <select
                id="rule-policy"
                value={formData.onLimitExceedPolicy}
                onChange={(e) =>
                  updateForm({
                    ...formData,
                    onLimitExceedPolicy: e.target.value as Rule['onLimitExceedPolicy'],
                  })
                }
                className={`w-full px-3 py-2 ${theme.colors.bgInput} ${theme.colors.border} rounded-lg border text-sm ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
              >
                <option value="REJECT_REQUEST">REJECT_REQUEST (429)</option>
                <option value="WAIT_FOR_REFILL">WAIT_FOR_REFILL (Delay)</option>
              </select>
              {fieldError('onLimitExceedPolicy')}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className={`text-xs ${theme.colors.textTertiary}`}>Rate Bands</span>
                <button
                  type="button"
                  onClick={addBand}
                  className={`flex items-center gap-1 text-xs ${theme.colors.accent}`}
                >
                  <Plus size={12} /> Add Band
                </button>
              </div>
              {fieldError('bands')}
              <div className="space-y-2">
                {formData.bands.map((band, idx) => (
                  <div
                    key={idx}
                    className={`flex items-start gap-2 p-3 ${theme.colors.bgTertiary} rounded-lg ${theme.colors.borderSubtle} border`}
                  >
                    <div className="grid flex-1 grid-cols-3 gap-2">
                      <div>
                        <label
                          htmlFor={`band-window-${idx}`}
                          className={`block text-[10px] ${theme.colors.textMuted} mb-1`}
                        >
                          Window (sec)
                        </label>
                        <input
                          id={`band-window-${idx}`}
                          type="number"
                          min={1}
                          value={band.windowSeconds}
                          onChange={(e) =>
                            updateBand(idx, 'windowSeconds', parseInt(e.target.value, 10))
                          }
                          aria-invalid={!!errors[`bands[${idx}].windowSeconds`]}
                          className={`w-full px-2 py-1.5 ${theme.colors.bgInput} ${inputBorder(`bands[${idx}].windowSeconds`)} rounded border text-xs ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                        />
                        {fieldError(`bands[${idx}].windowSeconds`)}
                      </div>
                      <div>
                        <label
                          htmlFor={`band-capacity-${idx}`}
                          className={`block text-[10px] ${theme.colors.textMuted} mb-1`}
                        >
                          Capacity
                        </label>
                        <input
                          id={`band-capacity-${idx}`}
                          type="number"
                          min={1}
                          value={band.capacity}
                          onChange={(e) =>
                            updateBand(idx, 'capacity', parseInt(e.target.value, 10))
                          }
                          aria-invalid={!!errors[`bands[${idx}].capacity`]}
                          className={`w-full px-2 py-1.5 ${theme.colors.bgInput} ${inputBorder(`bands[${idx}].capacity`)} rounded border text-xs ${theme.colors.textPrimary} focus:outline-none ${theme.colors.borderFocus}`}
                        />
                        {fieldError(`bands[${idx}].capacity`)}
                      </div>
                      <div>
                        <label
                          htmlFor={`band-label-${idx}`}
                          className={`block text-[10px] ${theme.colors.textMuted} mb-1`}
                        >
                          Label
                        </label>
                        <input
                          id={`band-label-${idx}`}
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
                        type="button"
                        onClick={() => removeBand(idx)}
                        aria-label={`Remove band ${idx + 1}`}
                        className={`mt-5 p-1.5 ${theme.colors.textMuted} rounded hover:opacity-80`}
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
                type="button"
                onClick={onClose}
                className={`flex-1 py-2.5 ${theme.colors.bgTertiary} hover:opacity-80 ${theme.colors.textSecondary} rounded-lg font-medium transition-colors`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
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
