'use client';

import React, { useMemo, useRef, useState } from 'react';

import { Download, Eye, Pencil, Play, Plus, Trash2, Upload } from 'lucide-react';
import useSWR from 'swr';

import {
  ApiError,
  assertSafeRuleNumbers,
  createRule,
  type CreateRuleRequest,
  deleteRule,
  exportRules,
  fetchOverview,
  fetchRules,
  importRules,
  toggleRule,
  updateRule,
} from '@/lib/api';
import { formatCount } from '@/lib/format';
import { scopeLabel } from '@/lib/labels';
import { mapApiRuleToRule, mapRuleToCreateRequest, mapRuleToUpdateRequest } from '@/lib/mappers';
import { diffRules, type FieldChange } from '@/lib/ruleDiff';
import { describeBand, formatLimit } from '@/lib/ruleMeaning';
import { RuleFormPanel, SimulationPanel } from '@/modules/admin';
import { type FieldErrors, type Rule, ruleIdentity } from '@/modules/admin/types';

import { ConfirmChangeDialog } from '../ConfirmChangeDialog';
import { Field } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import {
  Badge,
  BUTTON,
  BUTTON_PRIMARY,
  IconButton,
  INPUT,
  Notice,
  PageHeader,
  PageIntro,
  Panel,
  TD,
  TH,
} from '../ui';
import { useLive } from '../useLive';

type Pending =
  | {
      kind: 'save';
      rule: Rule | null;
      data: Partial<Rule> & { id: string };
      changes: FieldChange[];
    }
  | { kind: 'toggle'; rule: Rule; changes: FieldChange[] }
  | { kind: 'delete'; rule: Rule; changes: FieldChange[] };

function toFieldErrors(details: string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const detail of details) {
    const separator = detail.indexOf(':');
    if (separator > 0) {
      errors[detail.slice(0, separator).trim()] = detail.slice(separator + 1).trim();
    }
  }
  return errors;
}

export function RulesScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const rules = useSWR('rules', async () => (await fetchRules()).map(mapApiRuleToRule));
  const daily = useLive('overview:24h', () => fetchOverview({ window: '24h' }));

  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Rule | null | undefined>(undefined);
  const [simulating, setSimulating] = useState<Rule | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [formErrors, setFormErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);

  const rejectedBySet = useMemo(
    () => new Map((daily.data?.ruleSets ?? []).map((set) => [set.ruleSetId, set.rejected])),
    [daily.data]
  );

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (rules.data ?? []).filter(
      (rule) =>
        !needle ||
        rule.id.toLowerCase().includes(needle) ||
        rule.name.toLowerCase().includes(needle) ||
        (rule.ruleSetId ?? '').toLowerCase().includes(needle) ||
        rule.tags.some((tag) => tag.toLowerCase().includes(needle))
    );
    const byGroup = new Map<string | null, Rule[]>();
    for (const rule of matches) {
      byGroup.set(rule.ruleSetId, [...(byGroup.get(rule.ruleSetId) ?? []), rule]);
    }
    return [...byGroup.entries()].sort(([a], [b]) =>
      a === null ? 1 : b === null ? -1 : a.localeCompare(b)
    );
  }, [rules.data, query]);

  const message = (err: unknown) =>
    err instanceof ApiError && err.status === 409
      ? t('rules.conflict')
      : err instanceof Error
        ? err.message
        : String(err);

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setFormError(null);
    try {
      if (pending.kind === 'toggle') {
        await toggleRule(pending.rule.id, pending.rule.ruleSetId);
      } else if (pending.kind === 'delete') {
        await deleteRule(pending.rule.id, pending.rule.ruleSetId);
      } else if (pending.rule) {
        assertSafeRuleNumbers(pending.rule);
        await updateRule(
          pending.data.id,
          mapRuleToUpdateRequest(pending.data),
          pending.rule.ruleSetId
        );
      } else {
        await createRule(mapRuleToCreateRequest(pending.data));
      }
      setPending(null);
      setEditing(undefined);
      setFormErrors({});
      await rules.mutate();
    } catch (err) {
      setPending(null);
      if (pending.kind === 'save') {
        if (err instanceof ApiError && err.details.length > 0) {
          setFormErrors(toFieldErrors(err.details));
        }
        setFormError(message(err));
      } else {
        setError(message(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const onSave = (data: Partial<Rule> & { id: string }) => {
    const before = editing ?? null;
    setPending({ kind: 'save', rule: before, data, changes: diffRules(before, data, locale) });
  };

  const onExport = async () => {
    try {
      const blob = new Blob([await exportRules()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `fluxgate-rules-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(message(err));
    }
  };

  const onImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const payload: CreateRuleRequest[] = Array.isArray(parsed) ? parsed : parsed.rules;
      if (!Array.isArray(payload) || payload.length === 0) {
        setError(t('rules.importInvalid'));
        return;
      }
      payload.forEach(assertSafeRuleNumbers);
      if (!window.confirm(t('rules.importConfirm', { count: payload.length, file: file.name }))) {
        return;
      }
      const result = await importRules(payload);
      setNotice(t('rules.imported', { ...result }));
      await rules.mutate();
    } catch (err) {
      setError(err instanceof SyntaxError ? t('rules.importNotJson') : message(err));
    }
  };

  const pendingTitle = (item: Pending) =>
    item.kind === 'save' && !item.rule
      ? t('rules.confirmNew', { id: item.data.id })
      : `${(item.kind === 'save' ? item.rule : item.rule)?.ruleSetId ?? t('rules.unassigned')} / ${item.kind === 'save' ? item.data.id : item.rule.id}`;

  return (
    <div>
      <PageHeader title={t('rules.title')}>
        <button type="button" className={BUTTON} onClick={onExport}>
          <Download size={14} aria-hidden />
          {t('rules.export')}
        </button>
        {isAdmin ? (
          <>
            <button type="button" className={BUTTON} onClick={() => importInput.current?.click()}>
              <Upload size={14} aria-hidden />
              {t('rules.import')}
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json"
              hidden
              aria-hidden
              tabIndex={-1}
              onChange={onImport}
            />
            <button
              type="button"
              className={BUTTON_PRIMARY}
              onClick={() => {
                setFormErrors({});
                setFormError(null);
                setEditing(null);
              }}
            >
              <Plus size={14} aria-hidden />
              {t('rules.new')}
            </button>
          </>
        ) : (
          <Badge icon={Eye}>{t('rules.readOnly')}</Badge>
        )}
      </PageHeader>
      <PageIntro>{t('rules.intro')}</PageIntro>
      <form
        role="search"
        className="border-line bg-panel mb-4 flex flex-wrap items-end gap-3 rounded-md border p-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field id="rule-search" label={t('rules.searchLabel')} className="min-w-64 flex-1">
          <input
            id="rule-search"
            name="q"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`${t('rules.search')}…`}
            className={`${INPUT} w-full`}
          />
        </Field>
      </form>

      {error && (
        <Notice tone="bad" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}

      <Panel
        title={t('rules.listTitle')}
        state={{
          loading: !rules.data && !rules.error,
          error: rules.data ? undefined : rules.error,
          onRetry: () => void rules.mutate(),
        }}
        data={{
          headers: [
            t('col.ruleSet'),
            t('col.rule'),
            t('col.scope'),
            t('col.limit'),
            t('col.meaning'),
            t('col.enabled'),
          ],
          rows: (rules.data ?? []).map((rule) => [
            rule.ruleSetId,
            rule.id,
            scopeLabel(rule.scope, locale),
            rule.bands.map((band) => formatLimit(band, locale)).join(' / '),
            rule.bands.map((band) => describeBand(band, locale)).join(' / '),
            t(rule.enabled ? 'rules.status.on' : 'rules.status.off'),
          ]),
        }}
        csvName="rules.csv"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr>
                <th scope="col" className={TH}>
                  {t('col.rule')}
                </th>
                <th scope="col" className={TH}>
                  {t('col.scope')}
                </th>
                <th scope="col" className={TH}>
                  {t('col.limit')}
                </th>
                <th scope="col" className={TH}>
                  {t('col.meaning')}
                </th>
                <th scope="col" className={TH}>
                  {t('col.enabled')}
                </th>
                <th scope="col" className={`${TH} text-right`}>
                  {t('rules.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([ruleSetId, members]) => (
                <React.Fragment key={ruleSetId ?? '__none__'}>
                  <tr>
                    <th
                      scope="colgroup"
                      colSpan={6}
                      className="border-line bg-panel2 border-b px-3 py-1.5 text-left text-[13px] font-semibold"
                    >
                      <span className="mono">{ruleSetId ?? t('rules.unassigned')}</span>
                      {ruleSetId && (
                        <span className="num text-muted ml-3 text-xs font-normal">
                          {t('rules.rejected24h', {
                            count: formatCount(rejectedBySet.get(ruleSetId) ?? 0),
                          })}
                        </span>
                      )}
                    </th>
                  </tr>
                  {members.map((rule) => (
                    <tr key={ruleIdentity(rule)} className="hover:bg-panel2/60">
                      <td className={TD}>
                        <div className="mono text-fg whitespace-nowrap" translate="no">
                          {rule.id}
                        </div>
                        {rule.name !== rule.id && (
                          <div className="text-muted text-xs">{rule.name}</div>
                        )}
                      </td>
                      <td className={TD}>
                        <Badge>{scopeLabel(rule.scope, locale)}</Badge>
                      </td>
                      <td className={`${TD} num whitespace-nowrap`}>
                        {rule.bands.map((band) => (
                          <div key={band.windowSeconds}>{formatLimit(band, locale)}</div>
                        ))}
                      </td>
                      <td className={`${TD} text-fg2`}>
                        {rule.bands.map((band) => (
                          <div key={band.windowSeconds}>{describeBand(band, locale)}</div>
                        ))}
                      </td>
                      <td className={TD}>
                        {isAdmin ? (
                          <button
                            type="button"
                            role="switch"
                            aria-checked={rule.enabled}
                            aria-label={t('rules.toggleLabel', { id: rule.id })}
                            onClick={() =>
                              setPending({
                                kind: 'toggle',
                                rule,
                                changes: diffRules(
                                  rule,
                                  { ...rule, enabled: !rule.enabled },
                                  locale
                                ),
                              })
                            }
                            className="text-fg2 hover:text-fg flex h-8 items-center gap-2 rounded px-1 text-xs transition-colors"
                          >
                            <span
                              aria-hidden
                              className={`relative inline-block h-5 w-9 rounded-full transition-colors ${rule.enabled ? 'bg-primary' : 'bg-line-strong'}`}
                            >
                              <span
                                className={`absolute top-0.5 left-0 h-4 w-4 rounded-full bg-white shadow transition-transform ${rule.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                              />
                            </span>
                            <span className="whitespace-nowrap">
                              {t(rule.enabled ? 'rules.status.on' : 'rules.status.off')}
                            </span>
                          </button>
                        ) : (
                          <Badge tone={rule.enabled ? 'ok' : 'neutral'}>
                            {t(rule.enabled ? 'rules.status.on' : 'rules.status.off')}
                          </Badge>
                        )}
                      </td>
                      <td className={TD}>
                        <div className="flex justify-end gap-1">
                          <IconButton
                            label={t('rules.simulate')}
                            icon={Play}
                            onClick={() => setSimulating(rule)}
                            quiet
                          />
                          {isAdmin && (
                            <>
                              <IconButton
                                label={t('rules.edit')}
                                icon={Pencil}
                                onClick={() => {
                                  setFormErrors({});
                                  setFormError(null);
                                  setEditing(rule);
                                }}
                                quiet
                              />
                              <IconButton
                                label={t('rules.delete')}
                                icon={Trash2}
                                onClick={() => setPending({ kind: 'delete', rule, changes: [] })}
                                quiet
                                align="end"
                                className="hover:text-bad"
                              />
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
              {rules.data && groups.length === 0 && (
                <tr>
                  <td colSpan={6} className={`${TD} text-muted py-8 text-center`}>
                    {t('rules.empty')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing !== undefined && (
        <RuleFormPanel
          rule={editing}
          serverErrors={formErrors}
          formError={formError}
          onClose={() => {
            setEditing(undefined);
            setFormErrors({});
            setFormError(null);
          }}
          onSave={onSave}
        />
      )}
      {simulating && <SimulationPanel rule={simulating} onClose={() => setSimulating(null)} />}
      {pending && (
        <ConfirmChangeDialog
          title={pendingTitle(pending)}
          changes={pending.changes}
          busy={busy}
          confirmLabel={pending.kind === 'delete' ? t('rules.deleteConfirmLabel') : undefined}
          warning={pending.kind === 'delete' ? t('rules.deleteWarning') : undefined}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
