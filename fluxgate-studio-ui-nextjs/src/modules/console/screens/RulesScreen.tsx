'use client';

import React, { useMemo, useRef, useState } from 'react';

import { Download, Play, Plus, Trash2, Upload } from 'lucide-react';
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
import { mapApiRuleToRule, mapRuleToCreateRequest, mapRuleToUpdateRequest } from '@/lib/mappers';
import { diffRules, type FieldChange } from '@/lib/ruleDiff';
import { describeBand, formatLimit } from '@/lib/ruleMeaning';
import { RuleFormPanel, SimulationPanel } from '@/modules/admin';
import { type FieldErrors, type Rule, ruleIdentity } from '@/modules/admin/types';

import { ConfirmChangeDialog } from '../ConfirmChangeDialog';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON, BUTTON_PRIMARY, INPUT, Notice, PageHeader, Panel, TD, TH } from '../ui';
import { useLive } from '../useLive';

type Pending =
  | {
      kind: 'save';
      rule: Rule | null;
      data: Partial<Rule> & { id: string };
      changes: FieldChange[];
    }
  | { kind: 'toggle'; rule: Rule; changes: FieldChange[] };

function toFieldErrors(details: string[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const detail of details) {
    const separator = detail.indexOf(':');
    if (separator > 0)
      errors[detail.slice(0, separator).trim()] = detail.slice(separator + 1).trim();
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

  const fail = (err: unknown) => {
    if (err instanceof ApiError && err.status === 409) setError(t('rules.conflict'));
    else setError(err instanceof Error ? err.message : String(err));
  };

  const confirmPending = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.kind === 'toggle') {
        await toggleRule(pending.rule.id, pending.rule.ruleSetId);
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
      if (pending.kind === 'save' && err instanceof ApiError && err.details.length > 0) {
        setFormErrors(toFieldErrors(err.details));
      }
      setPending(null);
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const onSave = (data: Partial<Rule> & { id: string }) => {
    const before = editing ?? null;
    setPending({ kind: 'save', rule: before, data, changes: diffRules(before, data) });
  };

  const onToggle = (rule: Rule) =>
    setPending({
      kind: 'toggle',
      rule,
      changes: diffRules(rule, { ...rule, enabled: !rule.enabled }),
    });

  const onDelete = async (rule: Rule) => {
    if (!window.confirm(t('rules.deleteConfirm', { id: rule.id }))) return;
    try {
      await deleteRule(rule.id, rule.ruleSetId);
      await rules.mutate();
    } catch (err) {
      fail(err);
    }
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
      fail(err);
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
      if (!window.confirm(t('rules.importConfirm', { count: payload.length, file: file.name })))
        return;
      const result = await importRules(payload);
      setNotice(t('rules.imported', { ...result }));
      await rules.mutate();
    } catch (err) {
      if (err instanceof SyntaxError) setError(t('rules.importNotJson'));
      else fail(err);
    }
  };

  return (
    <div>
      <PageHeader title={t('rules.title')}>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('rules.search')}
          className={`${INPUT} w-64`}
        />
        <button type="button" className={BUTTON} onClick={onExport}>
          <Download size={12} />
          {t('rules.export')}
        </button>
        {isAdmin ? (
          <>
            <button type="button" className={BUTTON} onClick={() => importInput.current?.click()}>
              <Upload size={12} />
              {t('rules.import')}
            </button>
            <input
              ref={importInput}
              type="file"
              accept="application/json"
              hidden
              onChange={onImport}
            />
            <button type="button" className={BUTTON_PRIMARY} onClick={() => setEditing(null)}>
              <Plus size={12} />
              {t('rules.new')}
            </button>
          </>
        ) : (
          <span className="text-muted text-[11px]">{t('rules.readOnly')}</span>
        )}
      </PageHeader>

      {error && (
        <Notice tone="bad" onClose={() => setError(null)}>
          {error}
        </Notice>
      )}
      {notice && <Notice onClose={() => setNotice(null)}>{notice}</Notice>}

      <Panel
        title={t('rules.title')}
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
            rule.scope,
            rule.bands.map(formatLimit).join(' / '),
            rule.bands.map((band) => describeBand(band, locale)).join(' / '),
            rule.enabled ? 'on' : 'off',
          ]),
        }}
        csvName="rules.csv"
      >
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.rule')}</th>
              <th className={TH}>{t('col.scope')}</th>
              <th className={TH}>{t('col.limit')}</th>
              <th className={TH}>{t('col.meaning')}</th>
              <th className={TH}>{t('col.enabled')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {groups.map(([ruleSetId, members]) => (
              <React.Fragment key={ruleSetId ?? '__none__'}>
                <tr>
                  <td
                    colSpan={6}
                    className="border-line bg-panel2 border-b px-2 py-1 text-xs font-semibold"
                  >
                    <span className="num">{ruleSetId ?? t('rules.unassigned')}</span>
                    {ruleSetId && (
                      <span
                        className={`ml-3 font-normal ${rejectedBySet.get(ruleSetId) ? 'text-bad' : 'text-muted'}`}
                      >
                        {t('rules.rejected24h', {
                          count: formatCount(rejectedBySet.get(ruleSetId) ?? 0),
                        })}
                      </span>
                    )}
                  </td>
                </tr>
                {members.map((rule) => (
                  <tr key={ruleIdentity(rule)} className={rule.enabled ? '' : 'opacity-60'}>
                    <td className={`${TD} num`}>
                      {rule.id}
                      <div className="text-muted font-sans text-[11px]">{rule.name}</div>
                    </td>
                    <td className={TD}>
                      <span className="border-line-strong text-fg2 rounded border px-1 text-[10px]">
                        {rule.scope}
                      </span>
                    </td>
                    <td className={`${TD} num`}>{rule.bands.map(formatLimit).join(' / ')}</td>
                    <td className={`${TD} text-fg2`}>
                      {rule.bands.map((band) => (
                        <div key={band.windowSeconds}>{describeBand(band, locale)}</div>
                      ))}
                    </td>
                    <td className={TD}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={rule.enabled}
                        disabled={!isAdmin}
                        onClick={() => onToggle(rule)}
                        className={`relative inline-block h-3.5 w-6 rounded-full ${rule.enabled ? 'bg-ok' : 'bg-line-strong'} disabled:cursor-default`}
                      >
                        <span
                          className={`bg-panel absolute top-0.5 h-2.5 w-2.5 rounded-full ${rule.enabled ? 'right-0.5' : 'left-0.5'}`}
                        />
                      </button>
                    </td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <button type="button" className={BUTTON} onClick={() => setSimulating(rule)}>
                        <Play size={11} />
                        {t('rules.simulate')}
                      </button>
                      {isAdmin && (
                        <>
                          <button
                            type="button"
                            className={`${BUTTON} ml-1`}
                            onClick={() => setEditing(rule)}
                          >
                            {t('rules.edit')}
                          </button>
                          <button
                            type="button"
                            aria-label={t('rules.delete')}
                            className={`${BUTTON} text-bad ml-1`}
                            onClick={() => onDelete(rule)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            ))}
            {rules.data && groups.length === 0 && (
              <tr>
                <td colSpan={6} className={`${TD} text-muted text-center`}>
                  {t('rules.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      {editing !== undefined && (
        <RuleFormPanel
          rule={editing}
          serverErrors={formErrors}
          onClose={() => {
            setEditing(undefined);
            setFormErrors({});
          }}
          onSave={onSave}
        />
      )}
      {simulating && <SimulationPanel rule={simulating} onClose={() => setSimulating(null)} />}
      {pending && (
        <ConfirmChangeDialog
          title={
            pending.kind === 'save' && !pending.rule
              ? t('rules.confirmNew', { id: pending.data.id })
              : `${(pending.kind === 'toggle' ? pending.rule : pending.rule!).ruleSetId ?? ''} / ${pending.kind === 'toggle' ? pending.rule.id : pending.data.id}`
          }
          changes={pending.changes}
          busy={busy}
          onCancel={() => setPending(null)}
          onConfirm={confirmPending}
        />
      )}
    </div>
  );
}
