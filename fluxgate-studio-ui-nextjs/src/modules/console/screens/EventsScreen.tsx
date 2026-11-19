'use client';

import React, { useState } from 'react';

import {
  Activity,
  AlertCircle,
  Check,
  ChevronRight,
  CircleSlash,
  Clock3,
  Inbox,
  ListFilter,
  PanelRight,
  RefreshCw,
} from 'lucide-react';
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
import { formatClock } from '@/lib/format';

import { BUTTON, Field, INPUT } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { Forbidden, PageIntro } from '../ui';

import styles from './EventsScreen.module.css';

export function EventsScreen() {
  const { t, locale } = useI18n();
  const [selectedId, setSelectedId] = useState<string | null>();
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
    setSelectedId(undefined);
    setQuery(next);
    setCursors([undefined]);
    setPage(0);
    setInvalid(false);
  };
  return (
    <div className={styles.screen}>
      <PageIntro title={t('events.title')}>{t('events.intro')}</PageIntro>
      <form
        className={styles.toolbar}
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
        <button type="submit" className={styles.apply}>
          <ListFilter size={15} aria-hidden="true" />
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
          <RefreshCw size={14} aria-hidden="true" />
          {t('events.refresh')}
        </button>
      </form>
      {invalid && <p role="alert">{t('events.invalid')}</p>}
      <section className={styles.history} aria-label={t('events.history')}>
        <header className={styles.historyHead}>
          <h2>
            <Activity size={19} aria-hidden="true" />
            {t('events.history')}
          </h2>
          {result.data && !result.error && (
            <span>
              <Clock3 size={13} aria-hidden="true" />
              {t('events.received')}{' '}
              <time dateTime={new Date(result.data.receivedAt).toISOString()}>
                {formatClock(result.data.receivedAt)}
              </time>
            </span>
          )}
        </header>
        <div className={styles.interval}>
          <strong>{t('events.interval')}</strong>
          <span>
            {eventRangeLabel(query.from)} – {eventRangeLabel(query.to)}
          </span>
          <span>
            {t(
              query.outcome === 'ALLOW'
                ? 'events.allow'
                : query.outcome === 'REJECT'
                  ? 'events.reject'
                  : 'events.all'
            )}
          </span>
        </div>
        {result.error ? (
          <div role="alert" className={styles.notice}>
            <AlertCircle aria-hidden="true" />
            <p>{t('events.failed')}</p>
            <button className={BUTTON} onClick={() => void result.mutate()}>
              {t('events.retry')}
            </button>
          </div>
        ) : !result.data || !entries.length ? (
          <div role="status" className={styles.notice}>
            {!result.data ? <Clock3 aria-hidden="true" /> : <Inbox aria-hidden="true" />}
            <p>{t(!result.data ? 'common.loading' : 'events.empty')}</p>
          </div>
        ) : (
          <div className={styles.workspace} aria-busy={result.isValidating}>
            {entries.map((entry, index) => {
              const selected = entry.id === (selectedId === undefined ? entries[0].id : selectedId);
              const dateLabel = (time: number) =>
                new Date(time).toLocaleDateString(locale, {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                });
              const date = dateLabel(entry.occurredAt);
              const status = (
                <span className={entry.allowed ? styles.allowed : styles.rejected}>
                  {entry.allowed ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <CircleSlash size={13} aria-hidden="true" />
                  )}
                  {t(entry.allowed ? 'events.allow' : 'events.reject')}
                </span>
              );
              return (
                <React.Fragment key={entry.id}>
                  {(index === 0 || date !== dateLabel(entries[index - 1].occurredAt)) && (
                    <h3 className={styles.day}>{date}</h3>
                  )}
                  <button
                    type="button"
                    className={styles.row}
                    aria-expanded={selected}
                    aria-controls={selected ? 'event-inspector' : undefined}
                    onClick={() => setSelectedId(selected ? null : entry.id)}
                  >
                    <time dateTime={new Date(entry.occurredAt).toISOString()}>
                      {formatClock(entry.occurredAt)}
                    </time>
                    {status}
                    <span className={styles.rule}>{entry.ruleId ?? t('events.unknownRule')}</span>
                    <ChevronRight size={15} aria-hidden="true" />
                  </button>
                  {selected && (
                    <section
                      id="event-inspector"
                      className={styles.inspector}
                      aria-label={t('events.inspect')}
                      tabIndex={0}
                    >
                      <h3>
                        <PanelRight size={16} aria-hidden="true" />
                        {t('events.inspect')}
                      </h3>
                      <div className={styles.detailStatus}>{status}</div>
                      <time dateTime={new Date(entry.occurredAt).toISOString()}>
                        {eventRangeLabel(entry.occurredAt)}
                      </time>
                      <dl className={styles.metrics}>
                        <div>
                          <dt>{t('events.remaining')}</dt>
                          <dd>{displayCount(entry.remainingTokens)}</dd>
                        </div>
                        <div>
                          <dt>{t('events.retryAfter')}</dt>
                          <dd>{displayCount(entry.retryAfterMillis)}</dd>
                        </div>
                      </dl>
                      <dl className={styles.identifiers}>
                        <div>
                          <dt>{t('events.ruleSet')}</dt>
                          <dd>{entry.ruleSetId ?? '–'}</dd>
                        </div>
                        <div>
                          <dt>{t('events.rule')}</dt>
                          <dd>{entry.ruleId ?? '–'}</dd>
                        </div>
                      </dl>
                    </section>
                  )}
                </React.Fragment>
              );
            })}
            {selectedId === null && <p className={styles.placeholder}>{t('events.choose')}</p>}
          </div>
        )}
        <p className={styles.caption}>{t('events.snapshot')}</p>
      </section>
      <nav aria-label={t('events.title')} className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className={BUTTON}
          disabled={page === 0 || result.isValidating}
          onClick={() => {
            setSelectedId(undefined);
            setPage(page - 1);
          }}
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
              setSelectedId(undefined);
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
