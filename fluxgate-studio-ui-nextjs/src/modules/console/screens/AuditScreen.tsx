'use client';

import React, { useState } from 'react';

import useSWR from 'swr';

import { type ApiAuditEntry, fetchAudit, fetchAuditEntry } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON, Forbidden, INPUT, Notice, PageHeader, Panel, TD, TH } from '../ui';

const ACTIONS = [
  'RULE_CREATE',
  'RULE_UPDATE',
  'RULE_TOGGLE',
  'RULE_DELETE',
  'RULES_DELETE_ALL',
  'RULES_IMPORT',
  'POLICY_PUBLISH',
  'POLICY_ROLLBACK',
  'KEY_LOOKUP',
] as const;
const PAGE_SIZE = 50;

function show(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function Change({ entry }: { entry: ApiAuditEntry }) {
  const { t } = useI18n();
  if (entry.action === 'KEY_LOOKUP') {
    return <span>{t('audit.lookupOf', { value: show(entry.detail?.value) })}</span>;
  }
  const fields = Object.keys({ ...(entry.before ?? {}), ...(entry.after ?? {}) });
  if (fields.length === 0) return <span className="text-muted">{show(entry.detail)}</span>;
  return (
    <div className="space-y-0.5">
      {fields.map((field) => (
        <div key={field}>
          <span className="text-muted">{field} </span>
          <span className="bg-bad-soft text-bad">{show(entry.before?.[field])}</span>
          {' → '}
          <span className="bg-ok-soft text-ok">{show(entry.after?.[field])}</span>
        </div>
      ))}
    </div>
  );
}

export function AuditScreen() {
  const { t } = useI18n();
  const { isAdmin, loading } = useMe();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<ApiAuditEntry | null>(null);

  const search = { action, actor, q, page, size: PAGE_SIZE };
  const result = useSWR(isAdmin ? ['audit', search] : null, () => fetchAudit(search));

  if (!loading && !isAdmin) return <Forbidden />;

  const pages = Math.max(1, Math.ceil((result.data?.totalElements ?? 0) / PAGE_SIZE));
  const target = (entry: ApiAuditEntry) =>
    entry.target ? [entry.target.ruleSetId, entry.target.ruleId].filter(Boolean).join(' / ') : '–';

  return (
    <div>
      <PageHeader title={t('audit.title')}>
        <select
          value={action}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(0);
          }}
          className={INPUT}
        >
          <option value="">{t('audit.allActions')}</option>
          {ACTIONS.map((option) => (
            <option key={option} value={option}>
              {t(`action.${option}` as MessageKey)}
            </option>
          ))}
        </select>
        <input
          value={actor}
          onChange={(event) => {
            setActor(event.target.value);
            setPage(0);
          }}
          placeholder={t('audit.actor')}
          className={INPUT}
        />
        <input
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(0);
          }}
          placeholder={t('audit.search')}
          className={`${INPUT} w-56`}
        />
      </PageHeader>

      {result.error && <Notice tone="bad">{String((result.error as Error).message)}</Notice>}

      <Panel>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.time')}</th>
              <th className={TH}>{t('col.user')}</th>
              <th className={TH}>{t('col.action')}</th>
              <th className={TH}>{t('col.target')}</th>
              <th className={TH}>{t('col.change')}</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody>
            {(result.data?.content ?? []).map((entry) => (
              <tr key={entry.id}>
                <td className={`${TD} num whitespace-nowrap`}>
                  {formatDateTime(Date.parse(entry.at))}
                </td>
                <td className={TD}>{entry.actor.name || entry.actor.username}</td>
                <td className={TD}>
                  <span className="border-line-strong rounded border px-1 text-[10px]">
                    {t(`action.${entry.action}` as MessageKey)}
                  </span>
                </td>
                <td className={`${TD} num text-fg2`}>{target(entry)}</td>
                <td className={`${TD} num`}>
                  <Change entry={entry} />
                </td>
                <td className={`${TD} text-right`}>
                  <button
                    type="button"
                    className={BUTTON}
                    onClick={async () => setDetail(await fetchAuditEntry(entry.id))}
                  >
                    {t('audit.detail')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <footer className="text-muted flex items-center justify-end gap-2 px-3 py-2 text-[11px]">
          <button
            type="button"
            className={BUTTON}
            disabled={page === 0}
            onClick={() => setPage(page - 1)}
          >
            {t('common.previous')}
          </button>
          {t('common.page', { page: page + 1, pages })}
          <button
            type="button"
            className={BUTTON}
            disabled={page + 1 >= pages}
            onClick={() => setPage(page + 1)}
          >
            {t('common.next')}
          </button>
        </footer>
      </Panel>

      {detail && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/40"
          onClick={() => setDetail(null)}
        >
          <div
            className="border-line bg-panel h-full w-full max-w-lg overflow-y-auto border-l p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {t(`action.${detail.action}` as MessageKey)}
              </h2>
              <button type="button" className={BUTTON} onClick={() => setDetail(null)}>
                {t('common.close')}
              </button>
            </div>
            <pre className="num bg-panel2 overflow-x-auto rounded p-3 text-[11px]">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
