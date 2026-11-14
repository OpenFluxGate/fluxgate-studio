'use client';

import React, { useState } from 'react';

import { ChevronDown, ChevronRight } from 'lucide-react';
import useSWR from 'swr';

import { type ApiAuditEntry, fetchAudit, fetchAuditEntry } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';
import { formatLimit } from '@/lib/ruleMeaning';

import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { BUTTON, Forbidden, INPUT, Notice, PageHeader, Panel } from '../ui';

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
const SNAPSHOT_FIELDS = ['scope', 'bands', 'enabled'];
const ACTION_TONE: Record<string, string> = {
  RULE_CREATE: 'text-ok',
  RULE_DELETE: 'text-bad',
  RULES_DELETE_ALL: 'text-bad',
  KEY_LOOKUP: 'text-s1',
};

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function show(field: string, value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (field === 'bands' && Array.isArray(value)) {
    return value
      .map((band) => formatLimit(band as { windowSeconds: number; capacity: number }))
      .join(' / ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function changedFields(entry: ApiAuditEntry): string[] {
  return Object.keys({ ...(entry.before ?? {}), ...(entry.after ?? {}) });
}

function summary(entry: ApiAuditEntry, t: Translate): string {
  if (entry.action === 'KEY_LOOKUP') {
    return t('audit.lookupOf', { value: show('value', entry.detail?.value) });
  }
  if (entry.action === 'RULE_CREATE' || entry.action === 'RULE_DELETE') {
    const snapshot = (entry.action === 'RULE_CREATE' ? entry.after : entry.before) ?? {};
    return SNAPSHOT_FIELDS.map((field) => `${field} ${show(field, snapshot[field])}`).join(' · ');
  }
  const fields = changedFields(entry);
  if (fields.length === 0) return show('detail', entry.detail);
  return fields
    .map(
      (field) =>
        `${field} ${show(field, entry.before?.[field])} → ${show(field, entry.after?.[field])}`
    )
    .join(' · ');
}

function target(entry: ApiAuditEntry): string {
  return entry.target
    ? [entry.target.ruleSetId, entry.target.ruleId].filter(Boolean).join(' / ')
    : '–';
}

function Change({ entry }: { entry: ApiAuditEntry }) {
  const fields = changedFields(entry);
  if (fields.length === 0) return null;
  return (
    <div className="num space-y-0.5">
      {fields.map((field) => (
        <div key={field}>
          <span className="text-muted">{field} </span>
          <span className="bg-bad-soft text-bad">{show(field, entry.before?.[field])}</span>
          {' → '}
          <span className="bg-ok-soft text-ok">{show(field, entry.after?.[field])}</span>
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ApiAuditEntry>>({});

  const search = { action, actor, q, page, size: PAGE_SIZE };
  const result = useSWR(isAdmin ? ['audit', search] : null, () => fetchAudit(search));

  if (!loading && !isAdmin) return <Forbidden />;

  const entries = result.data?.content ?? [];
  const pages = Math.max(1, Math.ceil((result.data?.totalElements ?? 0) / PAGE_SIZE));

  const toggle = async (entry: ApiAuditEntry) => {
    if (openId === entry.id) {
      setOpenId(null);
      return;
    }
    setOpenId(entry.id);
    if (!details[entry.id]) {
      try {
        const full = await fetchAuditEntry(entry.id);
        setDetails((previous) => ({ ...previous, [entry.id]: full }));
      } catch {
        // The masked list entry stays visible when the full entry cannot be read.
      }
    }
  };

  const resetPage =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setter(value);
      setPage(0);
    };

  return (
    <div>
      <PageHeader title={t('audit.title')}>
        <select
          value={action}
          onChange={(event) => resetPage(setAction)(event.target.value)}
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
          onChange={(event) => resetPage(setActor)(event.target.value)}
          placeholder={t('audit.actor')}
          className={INPUT}
        />
        <input
          value={q}
          onChange={(event) => resetPage(setQ)(event.target.value)}
          placeholder={t('audit.search')}
          className={`${INPUT} w-56`}
        />
      </PageHeader>

      {result.error && <Notice tone="bad">{String((result.error as Error).message)}</Notice>}

      <Panel
        title={t('audit.title')}
        data={{
          headers: [
            t('col.time'),
            t('col.user'),
            t('col.action'),
            t('col.target'),
            t('col.change'),
          ],
          rows: entries.map((entry) => [
            formatTimestamp(Date.parse(entry.at)),
            entry.actor.name || entry.actor.username,
            entry.action,
            target(entry),
            summary(entry, t),
          ]),
        }}
        csvName="audit.csv"
      >
        <ul className="text-xs">
          {entries.map((entry) => {
            const open = openId === entry.id;
            const Icon = open ? ChevronDown : ChevronRight;
            const full = details[entry.id] ?? entry;
            return (
              <li key={entry.id} className="border-line/60 border-b">
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => toggle(entry)}
                  className="hover:bg-panel2 flex w-full items-center gap-3 px-3 py-1.5 text-left"
                >
                  <Icon size={12} className="text-muted shrink-0" />
                  <span className="num text-muted shrink-0">
                    {formatTimestamp(Date.parse(entry.at))}
                  </span>
                  <span
                    className={`w-28 shrink-0 truncate font-medium ${ACTION_TONE[entry.action] ?? 'text-fg2'}`}
                  >
                    {t(`action.${entry.action}` as MessageKey)}
                  </span>
                  <span className="text-fg2 w-24 shrink-0 truncate">
                    {entry.actor.name || entry.actor.username}
                  </span>
                  <span className="num text-fg2 w-64 shrink-0 truncate">{target(entry)}</span>
                  <span className="num min-w-0 flex-1 truncate">{summary(entry, t)}</span>
                </button>
                {open && (
                  <div className="bg-panel2 space-y-2 px-9 py-2">
                    <Change entry={full} />
                    <pre className="num bg-bg overflow-x-auto rounded p-2 text-[11px]">
                      {JSON.stringify(full, null, 2)}
                    </pre>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
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
    </div>
  );
}
