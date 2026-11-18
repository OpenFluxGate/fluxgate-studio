'use client';

import React, { useEffect, useState } from 'react';

import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ImageUp,
  Pencil,
  Plus,
  Power,
  Search,
  Send,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import useSWR from 'swr';

import { type ApiAuditEntry, fetchAudit, fetchAuditEntry } from '@/lib/api';
import { formatTimestamp } from '@/lib/format';
import { type Locale, type MessageKey } from '@/lib/i18n';
import { fieldLabel, valueLabel } from '@/lib/labels';
import { windowLabel } from '@/lib/timeRange';

import { Badge, BUTTON, BUTTON_QUIET, Field, INPUT, Select } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { RangeMenu } from '../TimeRangePicker';
import { Forbidden, PageHeader, PageIntro, Panel, TD, TH } from '../ui';

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
  'BRANDING_UPDATE',
] as const;
const PERIODS = ['24h', '7d', '30d', 'all'] as const;
type Period = (typeof PERIODS)[number];
const PERIOD_MILLIS: Record<Period, number | null> = {
  '24h': 24 * 3600_000,
  '7d': 7 * 24 * 3600_000,
  '30d': 30 * 24 * 3600_000,
  all: null,
};
const PAGE_SIZE = 50;
const SNAPSHOT_FIELDS = ['scope', 'bands', 'enabled'];

type BadgeTone = 'neutral' | 'ok' | 'warn' | 'bad' | 'info';
const ACTION_STYLE: Record<string, { tone: BadgeTone; icon: typeof Plus }> = {
  RULE_CREATE: { tone: 'neutral', icon: Plus },
  RULE_UPDATE: { tone: 'neutral', icon: Pencil },
  RULE_TOGGLE: { tone: 'neutral', icon: Power },
  RULE_DELETE: { tone: 'bad', icon: Trash2 },
  RULES_DELETE_ALL: { tone: 'bad', icon: Trash2 },
  RULES_IMPORT: { tone: 'neutral', icon: Upload },
  POLICY_PUBLISH: { tone: 'neutral', icon: Send },
  POLICY_ROLLBACK: { tone: 'warn', icon: Undo2 },
  KEY_LOOKUP: { tone: 'neutral', icon: Search },
  BRANDING_UPDATE: { tone: 'neutral', icon: ImageUp },
};

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/** Fields whose readable value changed. An empty object and an empty list both read as none. */
function changedFields(entry: ApiAuditEntry, locale: Locale = 'en'): string[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  return Object.keys({ ...before, ...after }).filter(
    (field) => valueLabel(field, before[field], locale) !== valueLabel(field, after[field], locale)
  );
}

function summary(entry: ApiAuditEntry, t: Translate, locale: Locale): string {
  if (entry.action === 'KEY_LOOKUP') {
    return t('audit.lookupOf', { value: valueLabel('value', entry.detail?.value, locale) });
  }
  if (entry.action === 'RULE_CREATE' || entry.action === 'RULE_DELETE') {
    const snapshot = (entry.action === 'RULE_CREATE' ? entry.after : entry.before) ?? {};
    return SNAPSHOT_FIELDS.filter((field) => field in snapshot)
      .map((field) => `${fieldLabel(field, locale)} ${valueLabel(field, snapshot[field], locale)}`)
      .join(' · ');
  }
  const fields = changedFields(entry, locale);
  if (fields.length === 0) {
    return entry.detail && Object.keys(entry.detail).length
      ? Object.entries(entry.detail)
          .map(
            ([field, value]) => `${fieldLabel(field, locale)} ${valueLabel(field, value, locale)}`
          )
          .join(' · ')
      : '';
  }
  return fields
    .map(
      (field) =>
        `${fieldLabel(field, locale)} ${valueLabel(field, entry.before?.[field], locale)} → ${valueLabel(field, entry.after?.[field], locale)}`
    )
    .join(' · ');
}

function target(entry: ApiAuditEntry, t: Translate): string {
  if (!entry.target) return '–';
  if (entry.target.setting) return t('settings.branding');
  return [entry.target.ruleSetId, entry.target.ruleId].filter(Boolean).join(' / ') || '–';
}

function ActionBadge({ action }: { action: string }) {
  const { t } = useI18n();
  const style = ACTION_STYLE[action] ?? { tone: 'neutral' as const, icon: Pencil };
  return (
    <Badge tone={style.tone} icon={style.icon}>
      {t(`action.${action}` as MessageKey)}
    </Badge>
  );
}

function Detail({ entry }: { entry: ApiAuditEntry }) {
  const { t, locale } = useI18n();
  const fields = changedFields(entry, locale);
  const snapshot =
    entry.action === 'RULE_CREATE'
      ? entry.after
      : entry.action === 'RULE_DELETE'
        ? entry.before
        : null;
  return (
    <div className="space-y-3 py-1">
      {snapshot ? (
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
          {Object.entries(snapshot).map(([field, value]) => (
            <React.Fragment key={field}>
              <dt className="text-muted">{fieldLabel(field, locale)}</dt>
              <dd className="text-fg">{valueLabel(field, value, locale)}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : fields.length > 0 ? (
        <table className="text-[13px]">
          <thead>
            <tr>
              <th scope="col" className={TH}>
                {t('confirm.field')}
              </th>
              <th scope="col" className={TH}>
                {t('confirm.before')}
              </th>
              <th scope="col" className={`${TH} w-6`}>
                <span className="sr-only">→</span>
              </th>
              <th scope="col" className={TH}>
                {t('confirm.after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field}>
                <td className={`${TD} text-fg2`}>{fieldLabel(field, locale)}</td>
                <td
                  className={`${TD} text-muted ${entry.before?.[field] == null ? '' : 'decoration-bad/60 line-through'}`}
                >
                  {valueLabel(field, entry.before?.[field], locale)}
                </td>
                <td className={TD}>
                  <ArrowRight size={14} aria-hidden className="text-muted" />
                </td>
                <td className={`${TD} text-fg font-medium`}>
                  {valueLabel(field, entry.after?.[field], locale)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-muted text-[13px]">{t('audit.noChange')}</p>
      )}
      <details className="text-xs">
        <summary className="text-muted hover:text-fg cursor-pointer">{t('audit.raw')}</summary>
        <pre className="mono border-line bg-bg mt-2 max-h-72 overflow-auto rounded border p-2 text-[11px]">
          {JSON.stringify(entry, null, 2)}
        </pre>
      </details>
    </div>
  );
}

export function AuditScreen() {
  const { t, locale } = useI18n();
  const { isAdmin, loading } = useMe();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState<Period>('7d');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, ApiAuditEntry>>({});

  const debouncedActor = useDebounced(actor.trim());
  const debouncedQ = useDebounced(q.trim());

  const result = useSWR(
    isAdmin ? ['audit', action, debouncedActor, debouncedQ, period, page] : null,
    () => {
      const span = PERIOD_MILLIS[period];
      return fetchAudit({
        action,
        actor: debouncedActor,
        q: debouncedQ,
        from: span === null ? undefined : Date.now() - span,
        page,
        size: PAGE_SIZE,
      });
    },
    { keepPreviousData: true }
  );

  if (!loading && !isAdmin) return <Forbidden />;

  const entries = result.data?.content ?? [];
  const total = result.data?.totalElements ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(action || actor || q || period !== '7d');

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

  const clear = () => {
    setAction('');
    setActor('');
    setQ('');
    setPeriod('7d');
    setPage(0);
  };

  return (
    <div>
      <PageHeader heading={false} title={t('audit.title')}>
        <RangeMenu
          label={t('audit.period')}
          value={period}
          options={PERIODS}
          format={(option) => windowLabel(option, locale)}
          onChange={resetPage(setPeriod)}
        />
      </PageHeader>
      <PageIntro title={t('audit.title')}>{t('audit.intro')}</PageIntro>

      <form
        role="search"
        className="border-line bg-panel mb-4 flex flex-wrap items-end gap-3 rounded-md border p-3"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field id="audit-action" label={t('audit.filterAction')}>
          <Select
            id="audit-action"
            className="w-44"
            value={action}
            options={[
              { value: '', label: t('audit.allActions') },
              ...ACTIONS.map((option) => ({
                value: option as string,
                label: t(`action.${option}` as MessageKey),
              })),
            ]}
            onChange={resetPage(setAction)}
          />
        </Field>
        <Field id="audit-user" label={t('audit.filterUser')}>
          <input
            id="audit-user"
            name="actor"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={actor}
            onChange={(event) => resetPage(setActor)(event.target.value)}
            placeholder={t('audit.userPlaceholder')}
            className={`${INPUT} w-40`}
          />
        </Field>
        <Field id="audit-target" label={t('audit.filterTarget')} className="min-w-56 flex-1">
          <input
            id="audit-target"
            name="target"
            type="search"
            autoComplete="off"
            spellCheck={false}
            value={q}
            onChange={(event) => resetPage(setQ)(event.target.value)}
            placeholder={t('audit.targetPlaceholder')}
            className={`${INPUT} mono w-full placeholder:font-sans`}
          />
        </Field>
        {filtered && (
          <button type="button" className={BUTTON_QUIET} onClick={clear}>
            <X size={14} aria-hidden />
            {t('audit.clear')}
          </button>
        )}
      </form>

      <Panel
        title={t('audit.listTitle')}
        actions={
          result.data && (
            <span className="num text-muted text-xs">{t('audit.count', { total })}</span>
          )
        }
        data={{
          headers: [
            t('col.time'),
            t('col.action'),
            t('col.user'),
            t('col.target'),
            t('col.change'),
          ],
          rows: entries.map((entry) => [
            formatTimestamp(Date.parse(entry.at)),
            t(`action.${entry.action}` as MessageKey),
            entry.actor.name || entry.actor.username,
            target(entry, t),
            summary(entry, t, locale),
          ]),
        }}
        csvName="activity.csv"
        state={{
          loading: !result.data && !result.error,
          error: result.data ? undefined : result.error,
          onRetry: () => void result.mutate(),
        }}
      >
        {entries.length === 0 ? (
          <div className="text-muted flex flex-col items-center gap-2 px-3 py-10 text-center text-[13px]">
            {t('audit.empty')}
            {filtered && (
              <button type="button" className={BUTTON} onClick={clear}>
                {t('audit.clear')}
              </button>
            )}
          </div>
        ) : (
          <div
            role="region"
            aria-label={t('audit.listTitle')}
            tabIndex={0}
            className={`overflow-x-auto transition-opacity ${result.isValidating ? 'opacity-70' : ''}`}
            aria-busy={result.isValidating}
          >
            <table className="w-full table-fixed text-[13px]">
              <colgroup>
                <col className="w-9" />
                <col className="w-40" />
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-44 xl:w-64" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    <span className="sr-only">{t('col.detail')}</span>
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.time')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.action')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.user')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.target')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.change')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const open = openId === entry.id;
                  const Icon = open ? ChevronDown : ChevronRight;
                  const time = formatTimestamp(Date.parse(entry.at));
                  const text = summary(entry, t, locale);
                  return (
                    <React.Fragment key={entry.id}>
                      <tr
                        className="hover:bg-panel2 cursor-pointer"
                        onClick={() => void toggle(entry)}
                      >
                        <td className={`${TD} pr-0`}>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={`audit-detail-${entry.id}`}
                            aria-label={t('audit.toggle', {
                              time,
                              action: t(`action.${entry.action}` as MessageKey),
                            })}
                            onClick={(event) => {
                              event.stopPropagation();
                              void toggle(entry);
                            }}
                            className="text-muted hover:bg-line hover:text-fg flex h-6 w-6 items-center justify-center rounded"
                          >
                            <Icon size={14} aria-hidden />
                          </button>
                        </td>
                        <td className={`${TD} num text-fg2 whitespace-nowrap`}>{time}</td>
                        <td className={TD}>
                          <ActionBadge action={entry.action} />
                        </td>
                        <td className={`${TD} truncate`} title={entry.actor.username}>
                          {entry.actor.name || entry.actor.username}
                        </td>
                        <td className={`${TD} mono text-fg2`} title={target(entry, t)}>
                          {entry.target?.ruleSetId && entry.target?.ruleId ? (
                            <>
                              <div className="truncate">{String(entry.target.ruleSetId)}</div>
                              <div className="text-muted truncate text-xs">
                                {String(entry.target.ruleId)}
                              </div>
                            </>
                          ) : (
                            <div className="truncate">{target(entry, t)}</div>
                          )}
                        </td>
                        <td className={`${TD} text-fg2`} title={text}>
                          <span className="line-clamp-2">{text || '–'}</span>
                        </td>
                      </tr>
                      {open && (
                        <tr id={`audit-detail-${entry.id}`}>
                          <td className="border-line/70 bg-panel2 border-b" />
                          <td colSpan={5} className="border-line/70 bg-panel2 border-b px-3 py-2">
                            <Detail entry={details[entry.id] ?? entry} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <footer className="text-muted flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <span className="num">
              {t('common.items', {
                from: total ? page * PAGE_SIZE + 1 : 0,
                to: Math.min(total, (page + 1) * PAGE_SIZE),
                total,
              })}
            </span>
            <span className="flex items-center gap-2">
              <button
                type="button"
                className={BUTTON}
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                {t('common.previous')}
              </button>
              <span className="num">{t('common.page', { page: page + 1, pages })}</span>
              <button
                type="button"
                className={BUTTON}
                disabled={page + 1 >= pages}
                onClick={() => setPage(page + 1)}
              >
                {t('common.next')}
              </button>
            </span>
          </footer>
        )}
      </Panel>
    </div>
  );
}
