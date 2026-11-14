'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import useSWR from 'swr';

import { type ApiKeyLookup, fetchKeyTransforms, lookupKey } from '@/lib/api';
import {
  formatClock,
  formatCount,
  formatDateTime,
  formatHourMinute,
  formatMonthDay,
  formatTimestamp,
} from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';

import { TimeSeries } from '../charts';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import {
  BUTTON_PRIMARY,
  Forbidden,
  INPUT,
  Notice,
  PageHeader,
  Panel,
  SeverityIcon,
  TD,
  TH,
  WindowPicker,
} from '../ui';

const WINDOWS = ['1h', '24h', '7d'] as const;
type Range = (typeof WINDOWS)[number];

const STATUS_SEVERITY = {
  BLOCKED: 'bad',
  RECOVERED: 'warn',
  ALLOWED: 'ok',
} as const;

const STATUS_STYLE = {
  BLOCKED: 'text-bad',
  RECOVERED: 'text-warn',
  ALLOWED: 'text-ok',
} as const;

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

  const run = async (nextRange: Range = range) => {
    if (!value.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await lookupKey({ value: value.trim(), transform, window: nextRange }));
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

  return (
    <div>
      <PageHeader title={t('keys.title')}>
        <span className="text-muted text-[11px]">{t('keys.audited')}</span>
      </PageHeader>

      <form
        className="border-line bg-panel mb-3 flex flex-wrap items-center gap-2 rounded border p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <select
          aria-label={t('keys.transform')}
          value={transform}
          onChange={(event) => setTransform(event.target.value)}
          className={INPUT}
        >
          {(transforms.data ?? ['none']).map((option) => (
            <option key={option} value={option}>
              {t(`keys.transform.${option}` as MessageKey)}
            </option>
          ))}
        </select>
        <input
          aria-label={t('keys.value')}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('keys.placeholder')}
          className={`${INPUT} num w-80`}
        />
        <WindowPicker
          value={range}
          options={WINDOWS}
          onChange={(next) => {
            setRange(next);
            if (result) void run(next);
          }}
        />
        <button type="submit" className={BUTTON_PRIMARY} disabled={busy || !value.trim()}>
          {t('keys.lookup')}
        </button>
      </form>

      {error && <Notice tone="bad">{error}</Notice>}

      {result && result.ruleSets.length === 0 && <Notice>{t('keys.noResult')}</Notice>}

      {result && result.ruleSets.length > 0 && (
        <>
          <div className="mb-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {result.ruleSets.map((status) => (
              <Panel
                key={status.ruleSetId ?? '-'}
                title={`${status.ruleSetId ?? '-'} · ${t('keys.basis')}`}
              >
                <div className="space-y-1 px-3 py-2">
                  <div
                    className={`flex items-center gap-1.5 text-sm font-semibold ${STATUS_STYLE[status.status]}`}
                  >
                    <SeverityIcon severity={STATUS_SEVERITY[status.status]} />
                    {t(`keys.status.${status.status}` as MessageKey)}
                  </div>
                  <div className="num text-fg2 text-xs">
                    {formatDateTime(status.lastDecisionAt)}
                    {' · '}
                    {status.blockedUntil
                      ? t(status.status === 'BLOCKED' ? 'keys.blockedUntil' : 'keys.releasedAt', {
                          time: formatClock(status.blockedUntil),
                        })
                      : t('keys.remaining', { count: status.remainingTokens })}
                  </div>
                  <div className="text-muted text-[11px]">
                    {t('keys.counts', {
                      allowed: formatCount(status.allowed),
                      rejected: formatCount(status.rejected),
                    })}
                  </div>
                </div>
              </Panel>
            ))}
          </div>

          <Panel
            title={t('keys.timeline')}
            className="mb-2"
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
                  times={result.buckets.map((bucket) => bucket.start)}
                  series={[
                    {
                      label: t('decision.allowed'),
                      color: '--c-s1',
                      values: result.buckets.map((bucket) => bucket.allowed),
                    },
                    {
                      label: t('decision.rejected'),
                      color: '--c-s2',
                      values: result.buckets.map((bucket) => bucket.rejected),
                    },
                  ]}
                  height={large ? 480 : 160}
                  formatTime={result.window === '7d' ? formatMonthDay : formatHourMinute}
                  formatTooltipTime={formatTimestamp}
                />
              </div>
            )}
          </Panel>

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
              rows: result.recent.map((decision) => [
                formatTimestamp(decision.timestamp),
                decision.ruleId,
                `${decision.method ?? ''} ${decision.endpoint ?? ''}`.trim(),
                decision.allowed ? 'allowed' : 'rejected',
                decision.remainingTokens,
                decision.allowed ? null : decision.retryAfterMs,
              ]),
            }}
            csvName="recent-decisions.csv"
          >
            <div className="max-h-[480px] overflow-y-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={TH}>{t('col.time')}</th>
                    <th className={TH}>{t('col.rule')}</th>
                    <th className={TH}>{t('col.request')}</th>
                    <th className={TH}>{t('col.decision')}</th>
                    <th className={`${TH} text-right`}>{t('col.remaining')}</th>
                    <th className={`${TH} text-right`}>{t('col.retryAfter')}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.recent.map((decision, index) => (
                    <tr key={`${decision.timestamp}-${index}`}>
                      <td className={`${TD} num`}>
                        {formatDateTime(decision.timestamp)}:
                        {String(new Date(decision.timestamp).getSeconds()).padStart(2, '0')}
                      </td>
                      <td className={`${TD} num text-fg2`}>{decision.ruleId}</td>
                      <td className={`${TD} num text-fg2`}>
                        {decision.method} {decision.endpoint}
                      </td>
                      <td className={`${TD} ${decision.allowed ? 'text-ok' : 'text-bad'}`}>
                        {t(decision.allowed ? 'decision.allowed' : 'decision.rejected')}
                      </td>
                      <td className={`${TD} num text-right`}>{decision.remainingTokens}</td>
                      <td className={`${TD} num text-right`}>
                        {decision.allowed ? '–' : `${(decision.retryAfterMs / 1000).toFixed(1)}s`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </div>
  );
}
