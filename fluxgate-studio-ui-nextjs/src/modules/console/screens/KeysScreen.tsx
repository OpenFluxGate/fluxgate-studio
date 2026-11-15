'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Search } from 'lucide-react';
import useSWR from 'swr';

import { type ApiKeyLookup, fetchKeyTransforms, lookupKey } from '@/lib/api';
import { formatBucket, formatClock, formatCount, formatTimestamp } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { type SeriesSpec, SeriesStats, TimeSeries } from '../charts';
import { BUTTON, BUTTON_PRIMARY, Field, INPUT } from '../controls';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import {
  Forbidden,
  Notice,
  PageHeader,
  PageIntro,
  Panel,
  SeverityIcon,
  TD,
  TH,
  WindowPicker,
} from '../ui';

const WINDOWS = ['1h', '24h', '7d'] as const;
type Range = (typeof WINDOWS)[number];
const PAGE_SIZE = 20;

const STATUS_SEVERITY = { BLOCKED: 'bad', RECOVERED: 'warn', ALLOWED: 'ok' } as const;
const STATUS_TEXT = { BLOCKED: 'text-bad', RECOVERED: 'text-warn', ALLOWED: 'text-ok' } as const;

function Timeline({ result }: { result: ApiKeyLookup }) {
  const { t, locale } = useI18n();
  const times = useMemo(() => result.buckets.map((bucket) => bucket.start), [result]);
  const series: SeriesSpec[] = useMemo(() => {
    const settled = result.buckets.map(
      (bucket) => bucket.start >= result.from && bucket.start + result.bucketMillis <= result.to
    );
    return [
      {
        label: t('decision.allowed'),
        color: '--c-s1',
        values: result.buckets.map((bucket, index) => (settled[index] ? bucket.allowed : null)),
      },
      {
        label: t('decision.rejected'),
        color: '--c-s2',
        values: result.buckets.map((bucket, index) => (settled[index] ? bucket.rejected : null)),
      },
    ];
  }, [result, t]);
  const unit = t('overview.perBucket', { bucket: formatBucket(result.bucketMillis, locale) });
  return (
    <Panel
      title={`${t('keys.timeline')} · ${formatBucket(result.bucketMillis, locale)}`}
      description={t('overview.trendHelp')}
      className="mb-3"
      data={{
        headers: [t('col.time'), t('decision.allowed'), t('decision.rejected')],
        rows: result.buckets.map((bucket) => [
          formatTimestamp(bucket.start),
          bucket.allowed,
          bucket.rejected,
        ]),
      }}
      csvName="key-decisions.csv"
    >
      {(large) => (
        <div className="px-2 pb-2">
          <TimeSeries
            times={times}
            series={series}
            height={large ? 460 : 180}
            yLabel={unit}
            bucketMillis={result.bucketMillis}
            formatTooltipTime={formatTimestamp}
          />
          {series.map((spec) => (
            <SeriesStats
              key={spec.label}
              values={spec.values}
              unit={unit}
              label={spec.label}
              color={spec.color}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

export function KeysScreen() {
  const { t } = useI18n();
  const { isAdmin, loading } = useMe();
  const params = useSearchParams();
  const transforms = useSWR(isAdmin ? 'key-transforms' : null, fetchKeyTransforms);

  const [value, setValue] = useState(params.get('value') ?? '');
  const [transform, setTransform] = useState(params.get('transform') ?? 'none');
  const [range, setRange] = useState<Range>('24h');
  const [result, setResult] = useState<ApiKeyLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(0);

  const run = async (nextRange: Range = range) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await lookupKey({ value: value.trim(), transform, window: nextRange }));
      setPage(0);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (isAdmin && params.get('value')) void run();
    // Runs once when an admin arrives with a key in the address.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  if (!loading && !isAdmin) return <Forbidden />;

  const recent = result?.recent ?? [];
  const pages = Math.max(1, Math.ceil(recent.length / PAGE_SIZE));
  const visible = recent.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div>
      <PageHeader title={t('keys.title')} />
      <PageIntro>{t('keys.intro')}</PageIntro>

      <form
        role="search"
        className="border-line bg-panel mb-4 flex flex-wrap items-end gap-3 rounded-md border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <Field id="key-transform" label={t('keys.format')}>
          <select
            id="key-transform"
            name="transform"
            value={transform}
            onChange={(event) => setTransform(event.target.value)}
            className={`${INPUT} w-44`}
          >
            {(transforms.data ?? ['none']).map((option) => (
              <option key={option} value={option}>
                {t(`keys.transform.${option}` as MessageKey)}
              </option>
            ))}
          </select>
        </Field>
        <Field id="key-value" label={t('keys.value')} className="min-w-64 flex-1">
          <input
            id="key-value"
            name="key"
            type="text"
            autoComplete="off"
            spellCheck={false}
            translate="no"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={t('keys.placeholder')}
            className={`${INPUT} mono w-full placeholder:font-sans`}
          />
        </Field>
        <div>
          <span id="key-window-label" className="text-fg2 mb-1 block text-xs font-medium">
            {t('keys.window')}
          </span>
          <WindowPicker
            label={t('keys.window')}
            value={range}
            options={WINDOWS}
            onChange={(next) => {
              setRange(next);
              if (result) void run(next);
            }}
          />
        </div>
        <button type="submit" className={BUTTON_PRIMARY} disabled={busy || !value.trim()}>
          <Search size={14} aria-hidden />
          {busy ? t('common.loading') : t('keys.lookup')}
        </button>
      </form>

      {error && <Notice tone="bad">{error}</Notice>}

      {!result && !error && (
        <div className="border-line-strong text-muted rounded-md border border-dashed px-4 py-10 text-center text-[13px]">
          {t('keys.empty')}
        </div>
      )}

      {result && result.ruleSets.length === 0 && <Notice>{t('keys.noResult')}</Notice>}

      {result && result.ruleSets.length > 0 && (
        <div aria-live="polite">
          <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.ruleSets.map((status) => (
              <Panel
                key={status.ruleSetId ?? '-'}
                title={status.ruleSetId ?? '-'}
                description={t('keys.basis')}
                menu={false}
              >
                <div className="space-y-1.5 px-3 pb-3">
                  <div
                    className={`flex items-center gap-1.5 text-[15px] font-semibold ${STATUS_TEXT[status.status]}`}
                  >
                    <SeverityIcon severity={STATUS_SEVERITY[status.status]} size={16} />
                    {t(`keys.status.${status.status}` as MessageKey)}
                  </div>
                  <div className="num text-fg2 text-[13px]">
                    {t('keys.lastDecision', { time: formatTimestamp(status.lastDecisionAt) })}
                    <span aria-hidden> · </span>
                    {status.blockedUntil
                      ? t(status.status === 'BLOCKED' ? 'keys.blockedUntil' : 'keys.releasedAt', {
                          time: formatClock(status.blockedUntil),
                        })
                      : t('keys.remaining', { count: status.remainingTokens })}
                  </div>
                  <div className="num text-muted text-xs">
                    {t('keys.counts', {
                      allowed: formatCount(status.allowed),
                      rejected: formatCount(status.rejected),
                    })}
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <Timeline result={result} />

          <Panel
            title={t('keys.recent')}
            data={{
              headers: [
                t('col.time'),
                t('col.rule'),
                t('col.request'),
                t('col.decision'),
                t('col.remaining'),
                t('col.retryAfter'),
              ],
              rows: recent.map((decision) => [
                formatTimestamp(decision.timestamp),
                decision.ruleId,
                `${decision.method ?? ''} ${decision.endpoint ?? ''}`.trim(),
                t(decision.allowed ? 'decision.allowed' : 'decision.rejected'),
                decision.remainingTokens,
                decision.allowed ? null : decision.retryAfterMs,
              ]),
            }}
            csvName="recent-decisions.csv"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr>
                    <th scope="col" className={TH}>
                      {t('col.time')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('col.rule')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('col.request')}
                    </th>
                    <th scope="col" className={TH}>
                      {t('col.decision')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('col.remaining')}
                    </th>
                    <th scope="col" className={`${TH} text-right`}>
                      {t('col.retryAfter')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((decision, index) => (
                    <tr key={`${decision.timestamp}-${index}`}>
                      <td className={`${TD} num whitespace-nowrap`}>
                        {formatTimestamp(decision.timestamp)}
                      </td>
                      <td className={`${TD} mono text-fg2`}>{decision.ruleId}</td>
                      <td className={`${TD} mono text-fg2`}>
                        {decision.method} {decision.endpoint}
                      </td>
                      <td className={TD}>
                        <span
                          className={`inline-flex items-center gap-1 ${decision.allowed ? 'text-ok' : 'text-bad'}`}
                        >
                          <SeverityIcon severity={decision.allowed ? 'ok' : 'bad'} size={13} />
                          {t(decision.allowed ? 'decision.allowed' : 'decision.rejected')}
                        </span>
                      </td>
                      <td className={`${TD} num text-right`}>{decision.remainingTokens}</td>
                      <td className={`${TD} num text-right`}>
                        {decision.allowed
                          ? '–'
                          : t('unit.seconds', { value: (decision.retryAfterMs / 1000).toFixed(1) })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recent.length > 0 && (
              <footer className="text-muted flex items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="num">
                  {t('common.items', {
                    from: recent.length ? page * PAGE_SIZE + 1 : 0,
                    to: Math.min(recent.length, (page + 1) * PAGE_SIZE),
                    total: recent.length,
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
      )}
    </div>
  );
}
