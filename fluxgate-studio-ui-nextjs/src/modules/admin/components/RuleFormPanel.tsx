'use client';

import React, { useEffect, useMemo, useState } from 'react';

import { Copy, Plus, Trash2 } from 'lucide-react';

import { type MessageKey } from '@/lib/i18n';
import { keyStrategyLabel, policyLabel, scopeLabel } from '@/lib/labels';
import { describeBand } from '@/lib/ruleMeaning';
import { BUTTON, BUTTON_PRIMARY, Field, IconButton, INPUT } from '@/modules/console/controls';
import { useI18n } from '@/modules/console/I18nProvider';
import { Drawer } from '@/modules/console/overlay';
import { Notice } from '@/modules/console/ui';

import { type FieldErrors, type RateBand, type Rule } from '../types';

interface RuleFormPanelProps {
  rule: Rule | null;
  onClose: () => void;
  onSave: (data: Partial<Rule> & { id: string }) => void;
  /** Per field messages returned by the server, keyed the same way as client side errors. */
  serverErrors?: FieldErrors;
  /** Error of the last save that has no field to attach to. */
  formError?: string | null;
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

const SCOPES: Rule['scope'][] = ['PER_USER', 'PER_IP', 'PER_API_KEY', 'GLOBAL', 'CUSTOM'];
const KEY_STRATEGIES = ['userId', 'ip', 'apiKey', 'custom'];
const POLICIES: Rule['onLimitExceedPolicy'][] = ['REJECT_REQUEST', 'WAIT_FOR_REFILL'];

/** Mirrors the server side pattern on the rule id. */
const RULE_ID_PATTERN = /^[a-zA-Z0-9-_]+$/;

/**
 * Client side validation mirroring the Admin API constraints. Values are message keys so the form
 * shows them in the chosen language.
 */
export function validateRule(formData: FormData): FieldErrors {
  const errors: FieldErrors = {};

  if (!formData.id.trim()) {
    errors.id = 'form.error.idRequired';
  } else if (!RULE_ID_PATTERN.test(formData.id)) {
    errors.id = 'form.error.idPattern';
  }

  if (!formData.name.trim()) {
    errors.name = 'form.error.nameRequired';
  }

  if (formData.bands.length === 0) {
    errors.bands = 'form.error.bandsRequired';
  }

  const seenWindows = new Set<number>();
  formData.bands.forEach((band, index) => {
    if (!Number.isSafeInteger(band.windowSeconds) || band.windowSeconds < 1) {
      errors[`bands[${index}].windowSeconds`] = 'form.error.positiveInteger';
    } else if (seenWindows.has(band.windowSeconds)) {
      errors[`bands[${index}].windowSeconds`] = 'form.error.duplicateWindow';
    } else {
      seenWindows.add(band.windowSeconds);
    }

    if (!Number.isSafeInteger(band.capacity) || band.capacity < 1) {
      errors[`bands[${index}].capacity`] = 'form.error.positiveInteger';
    }
  });

  if (!Number.isSafeInteger(formData.version) || formData.version < 0) {
    errors.version = 'form.error.version';
  }

  return errors;
}

const FIELD_ORDER = (bands: number) => [
  ['id', 'rule-id'],
  ['name', 'rule-name'],
  ['ruleSetId', 'rule-set'],
  ['bands', 'band-add'],
  ...Array.from({ length: bands }, (_, index) => [
    [`bands[${index}].windowSeconds`, `band-window-${index}`],
    [`bands[${index}].capacity`, `band-capacity-${index}`],
  ]).flat(),
];

function initialData(rule: Rule | null): FormData {
  return rule
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
        scope: 'PER_USER',
        keyStrategyId: 'userId',
        onLimitExceedPolicy: 'REJECT_REQUEST',
        bands: [{ windowSeconds: 60, capacity: 30, label: '' }],
        tags: [],
        ruleSetId: '',
        version: 0,
      };
}

export const RuleFormPanel = ({
  rule,
  onClose,
  onSave,
  serverErrors,
  formError,
}: RuleFormPanelProps) => {
  const { t, locale } = useI18n();
  const initial = useMemo(() => initialData(rule), [rule]);
  const [formData, setFormData] = useState<FormData>(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(', '));
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  // Server messages describe the submitted payload, so they are dropped once editing resumes.
  const [serverErrorsStale, setServerErrorsStale] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirty = JSON.stringify(formData) !== JSON.stringify(initial);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const errors: FieldErrors = {
    ...(serverErrorsStale ? {} : (serverErrors ?? {})),
    ...clientErrors,
  };
  const message = (name: string) => {
    const value = errors[name];
    if (!value) return undefined;
    return value.startsWith('form.error.') ? t(value as MessageKey) : value;
  };

  const updateForm = (next: FormData) => {
    setFormData(next);
    setServerErrorsStale(true);
  };

  const updateBand = (index: number, field: keyof RateBand, value: string | number) => {
    const bands = [...formData.bands];
    bands[index] = { ...bands[index], [field]: value };
    updateForm({ ...formData, bands });
  };

  const close = () => {
    if (dirty && !window.confirm(t('form.discardConfirm'))) return;
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const validation = validateRule(formData);
    setClientErrors(validation);
    const first = FIELD_ORDER(formData.bands.length).find(([name]) => validation[name]);
    if (first) {
      document.getElementById(first[1])?.focus();
      return;
    }
    setServerErrorsStale(false);
    onSave(formData);
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(formData.id);
      setCopied(true);
    } catch {
      // Clipboard access can be refused, the id stays visible for manual copying.
    }
  };

  const describedBy = (id: string, name: string) => (message(name) ? `${id}-error` : undefined);

  return (
    <Drawer
      title={t(rule ? 'form.editTitle' : 'form.newTitle')}
      description={rule ? `${rule.ruleSetId ?? t('rules.unassigned')} / ${rule.id}` : undefined}
      onClose={close}
      width="max-w-4xl"
      footer={
        <>
          <button type="button" className={BUTTON} onClick={close}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="rule-form" className={BUTTON_PRIMARY}>
            {t('form.save')}
          </button>
        </>
      }
    >
      <div className="grid min-h-full lg:grid-cols-[minmax(0,1fr)_20rem]">
        <form id="rule-form" noValidate onSubmit={submit} className="space-y-4 p-4">
          {formError && <Notice tone="bad">{formError}</Notice>}

          <div className="grid gap-4 sm:grid-cols-2">
            {rule ? (
              <div>
                <span className="text-fg2 mb-1 block text-xs font-medium">{t('field.id')}</span>
                <div className="flex h-8 items-center gap-1">
                  <span translate="no" className="mono text-fg min-w-0 flex-1 truncate text-[13px]">
                    {formData.id}
                  </span>
                  <IconButton
                    label={copied ? t('common.copied') : t('common.copy')}
                    icon={Copy}
                    onClick={copyId}
                    quiet
                  />
                </div>
                <p className="text-muted mt-1 text-xs">{t('form.idReadOnly')}</p>
              </div>
            ) : (
              <Field
                id="rule-id"
                label={t('field.id')}
                hint={t('form.idHint')}
                error={message('id')}
              >
                <input
                  id="rule-id"
                  name="id"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  translate="no"
                  value={formData.id}
                  onChange={(event) => updateForm({ ...formData, id: event.target.value })}
                  aria-invalid={!!message('id')}
                  aria-describedby={describedBy('rule-id', 'id')}
                  placeholder={t('form.idPlaceholder')}
                  className={`${INPUT} mono w-full`}
                />
              </Field>
            )}
            <Field id="rule-name" label={t('field.name')} error={message('name')}>
              <input
                id="rule-name"
                name="name"
                type="text"
                autoComplete="off"
                value={formData.name}
                onChange={(event) => updateForm({ ...formData, name: event.target.value })}
                aria-invalid={!!message('name')}
                aria-describedby={describedBy('rule-name', 'name')}
                placeholder={t('form.namePlaceholder')}
                className={`${INPUT} w-full`}
              />
            </Field>
            <Field
              id="rule-set"
              label={t('field.ruleSetId')}
              hint={t('form.ruleSetHint')}
              error={message('ruleSetId')}
            >
              <input
                id="rule-set"
                name="ruleSetId"
                type="text"
                autoComplete="off"
                spellCheck={false}
                translate="no"
                value={formData.ruleSetId}
                onChange={(event) => updateForm({ ...formData, ruleSetId: event.target.value })}
                placeholder={t('form.ruleSetPlaceholder')}
                className={`${INPUT} mono w-full`}
              />
            </Field>
            <Field id="rule-tags" label={t('field.tags')} hint={t('form.tagsHint')}>
              <input
                id="rule-tags"
                name="tags"
                type="text"
                autoComplete="off"
                value={tagsText}
                onChange={(event) => {
                  setTagsText(event.target.value);
                  updateForm({
                    ...formData,
                    tags: event.target.value
                      .split(',')
                      .map((tag) => tag.trim())
                      .filter(Boolean),
                  });
                }}
                placeholder={t('form.tagsPlaceholder')}
                className={`${INPUT} w-full`}
              />
            </Field>
            <Field id="rule-scope" label={t('field.scope')}>
              <select
                id="rule-scope"
                name="scope"
                value={formData.scope}
                onChange={(event) =>
                  updateForm({ ...formData, scope: event.target.value as Rule['scope'] })
                }
                className={`${INPUT} w-full`}
              >
                {SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {scopeLabel(scope, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rule-key-strategy" label={t('field.keyStrategyId')}>
              <select
                id="rule-key-strategy"
                name="keyStrategyId"
                value={formData.keyStrategyId}
                onChange={(event) => updateForm({ ...formData, keyStrategyId: event.target.value })}
                className={`${INPUT} w-full`}
              >
                {KEY_STRATEGIES.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {keyStrategyLabel(strategy, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="rule-policy" label={t('field.onLimitExceedPolicy')}>
              <select
                id="rule-policy"
                name="onLimitExceedPolicy"
                value={formData.onLimitExceedPolicy}
                onChange={(event) =>
                  updateForm({
                    ...formData,
                    onLimitExceedPolicy: event.target.value as Rule['onLimitExceedPolicy'],
                  })
                }
                className={`${INPUT} w-full`}
              >
                {POLICIES.map((policy) => (
                  <option key={policy} value={policy}>
                    {policyLabel(policy, locale)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex items-end pb-1.5">
              <label
                htmlFor="rule-enabled"
                className="text-fg flex h-8 cursor-pointer items-center gap-2 text-[13px]"
              >
                <input
                  id="rule-enabled"
                  name="enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(event) => updateForm({ ...formData, enabled: event.target.checked })}
                  className="h-4 w-4 accent-[var(--c-s1)]"
                />
                {t('form.enabled')}
              </label>
            </div>
          </div>

          <fieldset>
            <div className="mb-2 flex items-center justify-between">
              <legend className="text-fg2 text-xs font-medium">{t('field.bands')}</legend>
              <button
                id="band-add"
                type="button"
                className={BUTTON}
                onClick={() =>
                  updateForm({
                    ...formData,
                    bands: [...formData.bands, { windowSeconds: 600, capacity: 100, label: '' }],
                  })
                }
              >
                <Plus size={14} aria-hidden />
                {t('form.addBand')}
              </button>
            </div>
            {message('bands') && (
              <p role="alert" className="text-bad mb-2 text-xs">
                {message('bands')}
              </p>
            )}
            <div className="space-y-2">
              {formData.bands.map((band, index) => (
                <div key={index} className="border-line bg-panel2 rounded-md border p-3">
                  <div className="flex items-start gap-3">
                    <div className="grid flex-1 gap-3 sm:grid-cols-3">
                      <Field
                        id={`band-window-${index}`}
                        label={t('form.window')}
                        error={message(`bands[${index}].windowSeconds`)}
                      >
                        <input
                          id={`band-window-${index}`}
                          name={`bands.${index}.windowSeconds`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={band.windowSeconds}
                          onChange={(event) =>
                            updateBand(index, 'windowSeconds', Number(event.target.value))
                          }
                          aria-invalid={!!message(`bands[${index}].windowSeconds`)}
                          aria-describedby={describedBy(
                            `band-window-${index}`,
                            `bands[${index}].windowSeconds`
                          )}
                          className={`${INPUT} num bg-panel w-full`}
                        />
                      </Field>
                      <Field
                        id={`band-capacity-${index}`}
                        label={t('form.capacity')}
                        error={message(`bands[${index}].capacity`)}
                      >
                        <input
                          id={`band-capacity-${index}`}
                          name={`bands.${index}.capacity`}
                          type="number"
                          inputMode="numeric"
                          min={1}
                          value={band.capacity}
                          onChange={(event) =>
                            updateBand(index, 'capacity', Number(event.target.value))
                          }
                          aria-invalid={!!message(`bands[${index}].capacity`)}
                          aria-describedby={describedBy(
                            `band-capacity-${index}`,
                            `bands[${index}].capacity`
                          )}
                          className={`${INPUT} num bg-panel w-full`}
                        />
                      </Field>
                      <Field id={`band-label-${index}`} label={t('form.label')}>
                        <input
                          id={`band-label-${index}`}
                          name={`bands.${index}.label`}
                          type="text"
                          autoComplete="off"
                          value={band.label}
                          onChange={(event) => updateBand(index, 'label', event.target.value)}
                          placeholder={t('form.labelPlaceholder')}
                          className={`${INPUT} bg-panel w-full`}
                        />
                      </Field>
                    </div>
                    {formData.bands.length > 1 && (
                      <IconButton
                        label={t('form.removeBand', { n: index + 1 })}
                        icon={Trash2}
                        onClick={() =>
                          updateForm({
                            ...formData,
                            bands: formData.bands.filter((_, position) => position !== index),
                          })
                        }
                        quiet
                        align="end"
                        className="mt-5"
                      />
                    )}
                  </div>
                  <p className="text-fg2 mt-2 text-xs">{describeBand(band, locale)}</p>
                </div>
              ))}
            </div>
          </fieldset>
          {message('version') && (
            <p role="alert" className="text-bad text-xs">
              {message('version')}
            </p>
          )}
        </form>

        <aside className="border-line bg-bg/40 min-w-0 border-t p-4 lg:border-t-0 lg:border-l">
          <h3 className="text-muted mb-2 text-xs font-medium">{t('form.preview')}</h3>
          <pre className="mono border-line bg-panel2 text-fg2 rounded-md border p-3 text-xs break-all whitespace-pre-wrap">
            {JSON.stringify(
              {
                ...formData,
                ruleSetId: formData.ruleSetId || null,
              },
              null,
              2
            )}
          </pre>
        </aside>
      </div>
    </Drawer>
  );
};
