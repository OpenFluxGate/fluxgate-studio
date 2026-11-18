'use client';

import React, { useState } from 'react';

import useSWR from 'swr';

import { fetchDecisionEvents } from '@/lib/api';
import {
  decisionEventParams,
  type DecisionEventQuery,
  eventEndpoint,
  eventRangeLabel,
  lastHour,
  localDateTime,
} from '@/lib/decisionEvents';
import { formatTimestamp } from '@/lib/format';

import { BUTTON, Field, INPUT } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { Forbidden, PageIntro, TD, TH } from '../ui';

export function EventsScreen() {
  const { t } = useI18n();
  const { isAdmin, loading } = useMe();
  const [query, setQuery] = useState<DecisionEventQuery>(lastHour);
  const [from, setFrom] = useState(() => localDateTime(query.from));
  const [to, setTo] = useState(() => localDateTime(query.to));
  const [outcome, setOutcome] = useState('');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const cursor = cursors[page];
  const result = useSWR(
    isAdmin ? ['decision-events', query, cursor, refresh] : null,
    async () => ({ ...(await fetchDecisionEvents({ ...query, cursor })), receivedAt: Date.now() }),
    { keepPreviousData: false, revalidateOnFocus: false, shouldRetryOnError: false }
  );

  if (loading) return <p role="status">{t('common.loading')}</p>;
  if (!isAdmin) return <Forbidden />;
  const entries = result.data?.items ?? [];
  const displayCount = (value: number | null) => {
    if (value == null) return '–';
    return Number.isSafeInteger(value) ? value : t('events.precisionUnavailable');
  };
  const reset = (next: DecisionEventQuery) => {
    setQuery(next);
    setCursors([undefined]);
    setPage(0);
    setInvalid(false);
  };
  return (
    <div>
      <PageIntro title={t('events.title')}>{t('events.intro')}</PageIntro>
      <form
        className="border-line bg-panel mb-4 flex flex-wrap items-end gap-3 rounded-md border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const next: DecisionEventQuery = {
            from: eventEndpoint(from, query.from),
            to: eventEndpoint(to, query.to),
            outcome: outcome ? (outcome as 'ALLOW' | 'REJECT') : undefined,
            limit: 50,
          };
          try {
            decisionEventParams(next);
            reset(next);
          } catch {
            setInvalid(true);
          }
        }}
      >
        <Field id="events-from" label={t('events.from')}>
          <input
            id="events-from"
            type="datetime-local"
            step="0.001"
            required
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field id="events-to" label={t('events.to')}>
          <input
            id="events-to"
            type="datetime-local"
            step="0.001"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field id="events-outcome" label={t('events.outcome')}>
          <select
            id="events-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className={INPUT}
          >
            <option value="">{t('events.all')}</option>
            <option value="ALLOW">{t('events.allow')}</option>
            <option value="REJECT">{t('events.reject')}</option>
          </select>
        </Field>
        <button type="submit" className={BUTTON}>
          {t('events.apply')}
        </button>
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            const next = lastHour();
            setFrom(localDateTime(next.from));
            setTo(localDateTime(next.to));
            setOutcome('');
            reset(next);
            setRefresh((value) => value + 1);
          }}
        >
          {t('events.refresh')}
        </button>
      </form>
      {invalid && <p role="alert">{t('events.invalid')}</p>}
      <dl className="text-fg2 mb-2 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-muted text-xs">{t('events.interval')}</dt>
          <dd>
            {eventRangeLabel(query.from)} – {eventRangeLabel(query.to)}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs">{t('events.outcome')}</dt>
          <dd>
            {t(
              query.outcome === 'ALLOW'
                ? 'events.allow'
                : query.outcome === 'REJECT'
                  ? 'events.reject'
                  : 'events.all'
            )}
          </dd>
        </div>
        {result.data && !result.error && (
          <div>
            <dt className="text-muted text-xs">{t('events.received')}</dt>
            <dd>
              <time dateTime={new Date(result.data.receivedAt).toISOString()}>
                {formatTimestamp(result.data.receivedAt)}
              </time>
            </dd>
          </div>
        )}
      </dl>
      <p className="text-muted mb-3 text-sm">{t('events.snapshot')}</p>
      {result.error ? (
        <div role="alert">
          <p>{t('events.failed')}</p>
          <button className={BUTTON} onClick={() => void result.mutate()}>
            {t('events.retry')}
          </button>
        </div>
      ) : !result.data ? (
        <p role="status">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p role="status">{t('events.empty')}</p>
      ) : (
        <div
          className="overflow-x-auto"
          role="region"
          aria-label={t('events.title')}
          tabIndex={0}
          aria-busy={result.isValidating}
        >
          <table className="w-full min-w-[52rem] text-sm">
            <thead>
              <tr>
                {[
                  t('col.time'),
                  t('events.outcome'),
                  t('events.ruleSet'),
                  t('events.rule'),
                  t('events.remaining'),
                  t('events.retryAfter'),
                ].map((label) => (
                  <th scope="col" className={TH} key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className={`${TD} whitespace-nowrap`}>{formatTimestamp(entry.occurredAt)}</td>
                  <td className={TD}>{t(entry.allowed ? 'events.allow' : 'events.reject')}</td>
                  <td className={`${TD} max-w-64 break-all`}>{entry.ruleSetId ?? '–'}</td>
                  <td className={`${TD} max-w-64 break-all`}>{entry.ruleId ?? '–'}</td>
                  <td className={TD}>{displayCount(entry.remainingTokens)}</td>
                  <td className={TD}>{displayCount(entry.retryAfterMillis)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label={t('events.title')} className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className={BUTTON}
          disabled={page === 0 || result.isValidating}
          onClick={() => setPage(page - 1)}
        >
          {t('common.previous')}
        </button>
        {result.data && !result.error && (
          <span role="status">{t('events.page', { page: page + 1, count: entries.length })}</span>
        )}
        <button
          className={BUTTON}
          disabled={!result.data?.nextCursor || !!result.error || result.isValidating}
          onClick={() => {
            const next = result.data?.nextCursor;
            if (next) {
              setCursors([...cursors.slice(0, page + 1), next]);
              setPage(page + 1);
            }
          }}
        >
          {t('common.next')}
        </button>
      </nav>
    </div>
  );
}
