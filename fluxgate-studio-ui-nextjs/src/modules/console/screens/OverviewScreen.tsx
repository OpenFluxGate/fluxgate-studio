'use client';

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';

import { ExternalLink } from 'lucide-react';
import { useSWRConfig } from 'swr';

import {
  ApiError,
  fetchDashboardStats,
  fetchOverview,
  fetchTimeseries,
  fetchTopRejected,
} from '@/lib/api';
import {
  formatAgo,
  formatBucket,
  formatClock,
  formatCount,
  formatHourMinute,
  formatPercent,
  formatTimestamp,
} from '@/lib/format';
import { BAD_RATE, bucketRates, rateSeverity, summarize } from '@/lib/stats';
import { apiRangeParams, DEFAULT_RANGE, rangeKey, refreshMillis, zoomTo } from '@/lib/timeRange';

import { BarGauge, Legend, type SeriesSpec, Sparkline, TimeSeries } from '../charts';
import { useI18n } from '../I18nProvider';
import { useKiosk } from '../kiosk';
import { useMe } from '../MeProvider';
import { TimeRangePicker } from '../TimeRangePicker';
import {
  LiveStatus,
  Notice,
  PageHeader,
  Panel,
  Row,
  SeverityIcon,
  severityMark,
  StatPanel,
  TD,
  TH,
} from '../ui';
import { useDashboardState } from '../useDashboardState';
import { useLive, useNow } from '../useLive';

export function OverviewScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const { kiosk } = useKiosk();
  const now = useNow();
  const { mutate } = useSWRConfig();
  const [state, update] = useDashboardState();

  const params = apiRangeParams(state.range);
  const key = rangeKey(state.range);
  const refresh = refreshMillis(state);
  const ruleSet = state.ruleSet ?? undefined;

  const series = useLive(
    `series:${key}:${ruleSet ?? ''}`,
    () => fetchTimeseries(params, ruleSet),
    refresh
  );
  const overview = useLive(`overview:${key}`, () => fetchOverview(params), refresh);
  const top = useLive(
    `top:${key}:${ruleSet ?? ''}`,
    () => fetchTopRejected(params, 10, ruleSet),
    refresh
  );
  const stats = useLive('stats', fetchDashboardStats, refresh);

  const buckets = useMemo(() => series.data?.buckets ?? [], [series.data]);
  const summary = summarize(buckets);
  const times = useMemo(() => buckets.map((bucket) => bucket.start), [buckets]);
  const lines: SeriesSpec[] = useMemo(
    () => [
      {
        label: t('decision.allowed'),
        color: '--c-s1',
        values: buckets.map((bucket) => bucket.allowed),
      },
      {
        label: t('decision.rejected'),
        color: '--c-s2',
        values: buckets.map((bucket) => bucket.rejected),
      },
    ],
    [buckets, t]
  );
  const onZoom = useCallback(
    (from: number, to: number) => update({ range: zoomTo(from, to, Date.now()) }),
    [update]
  );

  const allSets = overview.data?.ruleSets ?? [];
  const sets = allSets.filter((set) => !state.ruleSet || set.ruleSetId === state.ruleSet);
  const topRows = top.data ?? [];
  const maxRejected = Math.max(1, ...topRows.map((row) => row.rejected));
  const maxRate = Math.max(BAD_RATE * 2, ...sets.map((set) => set.rejectRate));
  const invalidRange =
    state.range.kind === 'absolute' &&
    series.error instanceof ApiError &&
    series.error.status === 400;
  const external = process.env.NEXT_PUBLIC_EXTERNAL_DASHBOARD_URL;
  const ago = (timestamp: number | null) =>
    timestamp && now ? formatAgo(timestamp, now, locale) : t('overview.never');

  return (
    <div>
      <PageHeader title={t('overview.title')}>
        {external && (
          <a
            href={external}
            target="_blank"
            rel="noreferrer"
            className="text-fg2 hover:text-fg inline-flex items-center gap-1 text-xs"
          >
            {t('overview.external')}
            <ExternalLink size={12} />
          </a>
        )}
        <LiveStatus updatedAt={series.updatedAt} error={series.error} />
        <TimeRangePicker state={state} onChange={update} onRefresh={() => mutate(() => true)} />
      </PageHeader>

      {!kiosk && (
        <div className="mb-3 flex items-center gap-2">
          <label className="border-line-strong flex items-center overflow-hidden rounded border text-xs">
            <span className="border-line-strong bg-panel2 text-muted border-r px-2 py-1">
              {t('var.ruleSet')}
            </span>
            <select
              value={state.ruleSet ?? ''}
              onChange={(event) => update({ ruleSet: event.target.value || null })}
              className="bg-panel text-fg px-2 py-1 focus:outline-none"
            >
              <option value="">{t('var.all')}</option>
              {allSets.map((set) => (
                <option key={set.ruleSetId} value={set.ruleSetId}>
                  {set.ruleSetId}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {invalidRange && (
        <Notice tone="warn">
          {t('overview.rangeInvalid')}{' '}
          <button
            type="button"
            className="underline"
            onClick={() => update({ range: DEFAULT_RANGE })}
          >
            {t('overview.rangeReset')}
          </button>
        </Notice>
      )}
      {series.error && !series.data && !invalidRange && (
        <Notice tone="bad">{(series.error as Error).message}</Notice>
      )}
      {overview.data &&
        overview.data.total === 0 &&
        overview.data.ruleSets.every((set) => set.lastDecisionAt === null) && (
          <Notice>{t('overview.noEvents')}</Notice>
        )}

      <Row id="summary" title={t('row.summary')}>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatPanel
            title={t('overview.decisions')}
            value={series.data ? formatCount(summary.total) : '–'}
            spark={buckets.map((bucket) => bucket.allowed + bucket.rejected)}
            color="--c-s1"
          />
          <StatPanel
            title={t('overview.rejected')}
            value={series.data ? formatCount(summary.rejected) : '–'}
            spark={buckets.map((bucket) => bucket.rejected)}
            color="--c-s2"
          />
          <StatPanel
            title={t('overview.rejectRate')}
            value={series.data ? (summary.rate * 100).toFixed(1) : '–'}
            unit="%"
            severity={series.data ? rateSeverity(summary.rate) : undefined}
            spark={bucketRates(buckets)}
            color="--c-warning"
          />
          <StatPanel
            title={t('overview.activeRules')}
            value={stats.data ? String(stats.data.activeRules) : '–'}
            unit={stats.data ? `/ ${stats.data.totalRules}` : undefined}
          />
        </div>
      </Row>

      <Row id="trend" title={t('row.trend')}>
        <div className="grid items-start gap-2 lg:grid-cols-3">
          <Panel
            title={`${t('overview.trend')}${series.data ? ` · ${formatBucket(series.data.bucketMillis)}` : ''}`}
            className="lg:col-span-2"
            data={{
              headers: [t('col.time'), t('decision.allowed'), t('decision.rejected')],
              rows: buckets.map((bucket) => [
                formatTimestamp(bucket.start),
                bucket.allowed,
                bucket.rejected,
              ]),
            }}
            csvName="decisions.csv"
          >
            {(large) => (
              <div className="px-2 pb-2">
                <TimeSeries
                  times={times}
                  series={lines}
                  height={large ? 520 : 240}
                  syncKey="overview"
                  onZoom={onZoom}
                  formatTime={formatHourMinute}
                  formatTooltipTime={formatClock}
                />
                <Legend series={lines} />
              </div>
            )}
          </Panel>
          <Panel
            title={t('overview.topRejected')}
            data={{
              headers: [t('col.key'), t('col.ruleSet'), t('col.rejected'), t('col.lastRejected')],
              rows: topRows.map((row) => [
                row.key,
                row.ruleSetId,
                row.rejected,
                formatTimestamp(row.lastRejectedAt),
              ]),
            }}
            csvName="top-rejected.csv"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className={TH}>{t('col.key')}</th>
                    <th className={TH}>{t('col.ruleSet')}</th>
                    <th className={`${TH} w-32`}>{t('col.rejected')}</th>
                    <th className={TH}>{t('col.lastRejected')}</th>
                  </tr>
                </thead>
                <tbody>
                  {topRows.map((row) => (
                    <tr key={`${row.ruleSetId}:${row.key}`}>
                      <td className={`${TD} num`}>
                        {isAdmin && !row.masked ? (
                          <Link
                            href={`/keys?value=${encodeURIComponent(row.key)}&transform=none`}
                            className="text-s1 hover:underline"
                          >
                            {row.key}
                          </Link>
                        ) : (
                          row.key
                        )}
                      </td>
                      <td className={`${TD} num text-fg2 whitespace-nowrap`}>{row.ruleSetId}</td>
                      <td className={TD}>
                        <BarGauge
                          value={row.rejected}
                          max={maxRejected}
                          color="--c-s2"
                          label={formatCount(row.rejected)}
                        />
                      </td>
                      <td className={`${TD} text-muted whitespace-nowrap`}>
                        {ago(row.lastRejectedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </Row>

      <Row id="ruleSets" title={t('row.ruleSets')}>
        <Panel
          title={t('col.ruleSet')}
          data={{
            headers: [
              t('col.ruleSet'),
              t('col.decisions'),
              t('col.rejected'),
              t('col.rejectRate'),
              t('col.lastDecision'),
            ],
            rows: sets.map((set) => [
              set.ruleSetId,
              set.total,
              set.rejected,
              formatPercent(set.rejectRate),
              set.lastDecisionAt ? formatTimestamp(set.lastDecisionAt) : null,
            ]),
          }}
          csvName="rule-sets.csv"
        >
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>{t('col.ruleSet')}</th>
                <th className={TH}>{t('col.trend')}</th>
                <th className={`${TH} text-right`}>{t('col.decisions')}</th>
                <th className={`${TH} text-right`}>{t('col.rejected')}</th>
                <th className={`${TH} w-56`}>{t('col.rejectRate')}</th>
                <th className={TH}>{t('col.lastDecision')}</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => {
                const severity = rateSeverity(set.rejectRate);
                const selected = state.ruleSet === set.ruleSetId;
                return (
                  <tr
                    key={set.ruleSetId}
                    onClick={() => update({ ruleSet: selected ? null : set.ruleSetId })}
                    className={`hover:bg-panel2 cursor-pointer ${selected ? 'bg-select' : ''}`}
                  >
                    <td className={`${TD} num`}>{set.ruleSetId}</td>
                    <td className={TD}>
                      <Sparkline values={set.trend} />
                    </td>
                    <td className={`${TD} num text-right`}>{formatCount(set.total)}</td>
                    <td className={`${TD} num text-right`}>{formatCount(set.rejected)}</td>
                    <td className={TD}>
                      <div className="flex items-center gap-1.5">
                        <SeverityIcon severity={severity} />
                        <div className="flex-1">
                          <BarGauge
                            value={set.rejectRate}
                            max={maxRate}
                            color={severityMark(severity)}
                            label={formatPercent(set.rejectRate)}
                          />
                        </div>
                      </div>
                    </td>
                    <td className={`${TD} text-muted`}>{ago(set.lastDecisionAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </Row>
    </div>
  );
}
