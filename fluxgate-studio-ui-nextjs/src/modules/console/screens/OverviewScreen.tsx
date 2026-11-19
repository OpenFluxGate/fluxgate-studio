'use client';

import React, { useCallback, useMemo } from 'react';
import Link from 'next/link';

import { ArrowDownRight, ArrowUpRight, ExternalLink } from 'lucide-react';
import { useSWRConfig } from 'swr';

import {
  type ApiBucket,
  ApiError,
  fetchAudit,
  fetchDashboardStats,
  fetchOverview,
  fetchTimeseries,
  fetchTopRejected,
} from '@/lib/api';
import { formatAgo, formatBucket, formatCount, formatPercent, formatTimestamp } from '@/lib/format';
import { type MessageKey } from '@/lib/i18n';
import { relativeChange } from '@/lib/relativeChange';
import { BAD_RATE, bucketRates, rateSeverity, summarize, WARN_RATE } from '@/lib/stats';
import {
  apiRangeParams,
  DEFAULT_RANGE,
  rangeKey,
  rangeLabel,
  refreshMillis,
  zoomTo,
} from '@/lib/timeRange';

import {
  type Annotation,
  BarGauge,
  type SeriesSpec,
  SeriesStats,
  Sparkline,
  TimeSeries,
} from '../charts';
import { Select } from '../controls';
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

const RATE_SCALE = 0.2;

/** Points of the bucket still being counted are left out so the line does not fall to zero. */
/** A bucket is drawn only when it lies wholly inside the range, so partial edges never dip. */
function settled(buckets: ApiBucket[], bucketMillis: number, from: number, to: number) {
  return buckets.map((bucket) => bucket.start >= from && bucket.start + bucketMillis <= to);
}

function Delta({
  current,
  previous,
  points,
  badWhenUp,
}: {
  current: number;
  previous: number | null;
  points?: boolean;
  badWhenUp?: boolean;
}) {
  const { t } = useI18n();
  if (previous === null) return <span>{t('overview.noPrevious')}</span>;
  const relative = relativeChange(current, previous);
  if (!points && relative === null) return <span>{t('overview.zeroBaseline')}</span>;
  const change = points ? (current - previous) * 100 : relative!;
  const up = change > 0;
  const flat = Math.abs(change) < (points ? 0.05 : 0.005);
  const text = flat
    ? points
      ? '0%p'
      : '0%'
    : points
      ? `${up ? '+' : ''}${change.toFixed(1)}%p`
      : `${up ? '+' : ''}${(change * 100).toFixed(0)}%`;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? '' : badWhenUp ? (up ? 'text-bad' : 'text-ok') : 'text-fg2';
  return (
    <span className="inline-flex items-center gap-0.5">
      {!flat && <Icon size={12} aria-hidden className={tone} />}
      <span className={`num ${tone}`}>{text}</span>
      <span className="ml-1">{t('overview.vsPrevious', { delta: '' }).trim()}</span>
    </span>
  );
}

export function OverviewScreen() {
  const { t, locale } = useI18n();
  const { menus } = useMe();
  const showAudit = menus.includes('audit');
  const showKeyLookup = menus.includes('keys');
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
    `top:${showKeyLookup ? 'lookup' : 'masked'}:${key}:${ruleSet ?? ''}`,
    () => fetchTopRejected(params, 10, ruleSet),
    refresh
  );
  const stats = useLive('stats', fetchDashboardStats, refresh);

  const span = series.data ? series.data.to - series.data.from : 0;
  const previousKey = series.data
    ? `previous:${series.data.from - span}:${series.data.from}:${ruleSet ?? ''}`
    : null;
  const previous = useLive(
    previousKey,
    () =>
      fetchTimeseries(
        { from: String(series.data!.from - span), to: String(series.data!.from) },
        ruleSet
      ),
    0
  );
  const notesKey = showAudit && series.data ? `notes:${key}:${series.data.from}` : null;
  const notesSource = useLive(
    notesKey,
    () => fetchAudit({ from: series.data!.from, to: series.data!.to, page: 0, size: 100 }),
    refresh
  );

  const buckets = useMemo(() => series.data?.buckets ?? [], [series.data]);
  const bucketMillis = series.data?.bucketMillis ?? 60_000;
  const complete = useMemo(
    () => (series.data ? settled(buckets, bucketMillis, series.data.from, series.data.to) : []),
    [buckets, bucketMillis, series.data]
  );
  const times = useMemo(() => buckets.map((bucket) => bucket.start), [buckets]);
  const allowed: SeriesSpec[] = useMemo(
    () => [
      {
        label: t('decision.allowed'),
        color: '--c-s1',
        values: buckets.map((bucket, index) => (complete[index] ? bucket.allowed : null)),
      },
    ],
    [buckets, complete, t]
  );
  const rejected: SeriesSpec[] = useMemo(
    () => [
      {
        label: t('decision.rejected'),
        color: '--c-s2',
        values: buckets.map((bucket, index) => (complete[index] ? bucket.rejected : null)),
      },
    ],
    [buckets, complete, t]
  );
  const annotations: Annotation[] = useMemo(
    () =>
      ((showAudit && notesSource.data?.content) || [])
        .filter((entry) => entry.action !== 'KEY_LOOKUP')
        .map((entry) => ({
          time: Date.parse(entry.at),
          text: [
            t(`action.${entry.action}` as MessageKey),
            entry.target?.setting
              ? t(entry.target.setting === 'menus' ? 'menus.title' : 'settings.branding')
              : [entry.target?.ruleSetId, entry.target?.ruleId].filter(Boolean).join(' / '),
            entry.actor.name || entry.actor.username,
          ]
            .filter(Boolean)
            .join(' · '),
        })),
    [notesSource.data, showAudit, t]
  );
  const onZoom = useCallback(
    (from: number, to: number) => update({ range: zoomTo(from, to, Date.now()) }),
    [update]
  );

  const summary = summarize(buckets);
  const previousSummary = previous.data ? summarize(previous.data.buckets) : null;
  const settledBuckets = buckets.filter((_, index) => complete[index]);
  const unit = t('overview.perBucket', { bucket: formatBucket(bucketMillis, locale) });
  const allSets = overview.data?.ruleSets ?? [];
  const sets = allSets.filter((set) => !state.ruleSet || set.ruleSetId === state.ruleSet);
  const topRows = (top.data ?? []).filter((row) => showKeyLookup || row.masked === true);
  const maxRejected = Math.max(1, ...topRows.map((row) => row.rejected));
  const invalidRange =
    state.range.kind === 'absolute' &&
    series.error instanceof ApiError &&
    series.error.status === 400;
  const external = process.env.NEXT_PUBLIC_EXTERNAL_DASHBOARD_URL;
  const ago = (timestamp: number | null) =>
    timestamp && now ? formatAgo(timestamp, now, locale) : t('overview.never');

  const seriesSettled = Boolean(series.data) && !series.error && summary.total > 0;
  const seriesState = {
    loading: !series.data && !series.error,
    error: !series.data && !invalidRange ? series.error : undefined,
    staleError: series.data ? series.error : undefined,
    empty: !!series.data && summary.total === 0,
    onRetry: () => void series.mutate(),
  };
  const chartHelp = showAudit
    ? `${t('overview.trendHelp')} ${t('overview.annotationHelp')}`
    : t('overview.trendHelp');

  return (
    <div>
      <PageHeader title={t('overview.title')}>
        {external && (
          <a
            href={external}
            target="_blank"
            rel="noreferrer"
            className="text-s1-text inline-flex h-8 items-center gap-1 rounded px-2 text-xs hover:underline"
          >
            {t('overview.external')}
            <ExternalLink size={12} aria-hidden />
          </a>
        )}
        <LiveStatus updatedAt={series.updatedAt} error={series.error} />
        <TimeRangePicker state={state} onChange={update} onRefresh={() => mutate(() => true)} />
      </PageHeader>

      {kiosk ? (
        <div className="mb-4 flex items-center gap-3">
          <h1 className="text-lg font-semibold">{t('overview.title')}</h1>
          <span className="num text-fg2 text-[13px]">{rangeLabel(state.range, locale)}</span>
          {state.ruleSet && <span className="mono text-fg2 text-[13px]">{state.ruleSet}</span>}
          <LiveStatus updatedAt={series.updatedAt} error={series.error} />
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label
            htmlFor="variable-rule-set"
            className="border-line-strong focus-within:border-s1 focus-within:ring-s1/40 flex h-8 items-center rounded border focus-within:ring-2"
          >
            <span className="border-line-strong bg-panel2 text-fg2 flex h-full items-center rounded-l border-r px-2.5 text-xs font-medium">
              {t('var.ruleSet')}
            </span>
            <Select
              id="variable-rule-set"
              className="h-full"
              buttonClassName="bg-panel text-fg flex h-full min-w-40 items-center gap-2 rounded-r px-2 text-left text-[13px] focus-visible:outline-none"
              value={state.ruleSet ?? ''}
              options={[
                { value: '', label: t('var.all') },
                ...allSets.map((set) => ({ value: set.ruleSetId, label: set.ruleSetId })),
                ...(state.ruleSet && !allSets.some((set) => set.ruleSetId === state.ruleSet)
                  ? [{ value: state.ruleSet, label: state.ruleSet }]
                  : []),
              ]}
              onChange={(ruleSet) => update({ ruleSet: ruleSet || null })}
            />
          </label>
        </div>
      )}

      <p className="text-muted mb-4 text-xs">{t('overview.scopeHelp')}</p>

      {invalidRange && (
        <Notice tone="warn">
          {t('overview.rangeInvalid')}{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => update({ range: DEFAULT_RANGE })}
          >
            {t('overview.rangeReset')}
          </button>
        </Notice>
      )}
      {overview.data &&
        overview.data.total === 0 &&
        overview.data.ruleSets.every((set) => set.lastDecisionAt === null) && (
          <Notice>{t('overview.noEvents')}</Notice>
        )}

      <Row id="summary" title={t('row.summary')}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatPanel
            title={t('overview.decisions')}
            value={series.data ? formatCount(summary.total) : '–'}
            spark={settledBuckets.map((bucket) => bucket.allowed + bucket.rejected)}
            color="--c-s1"
            state={{ ...seriesState, empty: false }}
            delta={
              series.data && (
                <Delta current={summary.total} previous={previousSummary?.total ?? null} />
              )
            }
          />
          <StatPanel
            title={t('overview.rejected')}
            value={series.data ? formatCount(summary.rejected) : '–'}
            spark={settledBuckets.map((bucket) => bucket.rejected)}
            color="--c-s2"
            state={{ ...seriesState, empty: false }}
            delta={
              series.data && (
                <Delta
                  current={summary.rejected}
                  previous={previousSummary?.rejected ?? null}
                  badWhenUp
                />
              )
            }
          />
          <StatPanel
            title={t('overview.rejectRate')}
            description={t('overview.thresholds')}
            value={series.data && summary.total > 0 ? (summary.rate * 100).toFixed(1) : '–'}
            unit={series.data && summary.total > 0 ? '%' : undefined}
            severity={series.data && summary.total > 0 ? rateSeverity(summary.rate) : undefined}
            spark={bucketRates(settledBuckets)}
            color={
              series.data && summary.total > 0
                ? severityMark(rateSeverity(summary.rate))
                : '--c-warning'
            }
            state={{ ...seriesState, empty: false }}
            delta={
              series.data &&
              (summary.total === 0 ? (
                t('overview.noDecisions')
              ) : (
                <Delta
                  current={summary.rate}
                  previous={
                    previousSummary && previousSummary.total > 0 ? previousSummary.rate : null
                  }
                  points
                  badWhenUp
                />
              ))
            }
          />
          <StatPanel
            title={t('overview.activeRules')}
            description={t('overview.globalRules')}
            value={stats.data ? String(stats.data.activeRules) : '–'}
            unit={stats.data ? `/ ${stats.data.totalRules}` : undefined}
            delta={
              stats.data &&
              t('overview.disabledRules', {
                count: stats.data.totalRules - stats.data.activeRules,
              })
            }
            state={{
              loading: !stats.data && !stats.error,
              error: stats.data ? undefined : stats.error,
              staleError: stats.data ? stats.error : undefined,
              onRetry: () => void stats.mutate(),
            }}
          />
        </div>
        <p className="text-muted num mt-2 text-xs">
          {t('overview.rejectRate')} ·{' '}
          {t('overview.thresholdsShort', {
            warn: formatPercent(WARN_RATE),
            bad: formatPercent(BAD_RATE),
          })}
        </p>
      </Row>

      <Row id="trend" title={t('row.trend')}>
        <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <div className="flex min-w-0 flex-col gap-3 xl:col-span-2">
            <Panel
              title={`${t('overview.allowedSeries')} · ${formatBucket(bucketMillis, locale)}`}
              description={chartHelp}
              state={seriesState}
              bodyClassName={`flex min-h-[232px] flex-col ${seriesSettled ? '' : 'justify-center'}`}
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
                <>
                  <div className="px-2">
                    <TimeSeries
                      times={times}
                      series={allowed}
                      height={large ? 460 : 200}
                      syncKey="overview"
                      onZoom={onZoom}
                      yLabel={unit}
                      bucketMillis={bucketMillis}
                      annotations={annotations}
                      formatTooltipTime={formatTimestamp}
                    />
                  </div>
                  <SeriesStats
                    values={allowed[0].values}
                    unit={unit}
                    label={allowed[0].label}
                    color={allowed[0].color}
                  />
                </>
              )}
            </Panel>
            <Panel
              title={`${t('overview.rejectedSeries')} · ${formatBucket(bucketMillis, locale)}`}
              description={chartHelp}
              state={seriesState}
              bodyClassName={`flex min-h-[232px] flex-col ${seriesSettled ? '' : 'justify-center'}`}
            >
              {(large) => (
                <>
                  <div className="px-2">
                    <TimeSeries
                      times={times}
                      series={rejected}
                      height={large ? 460 : 160}
                      syncKey="overview"
                      onZoom={onZoom}
                      yLabel={unit}
                      bucketMillis={bucketMillis}
                      annotations={annotations}
                      formatTooltipTime={formatTimestamp}
                    />
                  </div>
                  <SeriesStats
                    values={rejected[0].values}
                    unit={unit}
                    label={rejected[0].label}
                    color={rejected[0].color}
                  />
                </>
              )}
            </Panel>
          </div>
          <div className="min-w-0 lg:relative">
            <Panel
              className="lg:absolute lg:inset-0 lg:flex lg:flex-col"
              bodyClassName="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:[mask-image:linear-gradient(to_bottom,black_calc(100%-32px),transparent)]"
              title={t('overview.topRejected')}
              description={t('overview.topHelp')}
              state={{
                loading: !top.data && !top.error,
                error: top.data ? undefined : top.error,
                staleError: top.data ? top.error : undefined,
                empty: !!top.data && topRows.length === 0,
                onRetry: () => void top.mutate(),
              }}
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
                <table className="w-full text-[13px]">
                  <thead>
                    <tr>
                      <th scope="col" className={TH}>
                        {t('col.keyAndSet')}
                      </th>
                      <th scope="col" className={`${TH} w-36`}>
                        {t('col.rejected')}
                      </th>
                      <th scope="col" className={TH}>
                        {t('col.lastRejected')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {topRows.map((row) => (
                      <tr key={`${row.ruleSetId}:${row.key}`}>
                        <td className={`${TD} mono whitespace-nowrap`}>
                          {showKeyLookup && !row.masked ? (
                            <Link
                              href={`/keys?value=${encodeURIComponent(row.key)}&transform=none`}
                              className="text-s1-text hover:underline"
                            >
                              {row.key}
                            </Link>
                          ) : (
                            row.key
                          )}
                          <div className="text-muted text-[11px]">{row.ruleSetId}</div>
                        </td>
                        <td className={TD}>
                          <BarGauge
                            value={row.rejected}
                            max={maxRejected}
                            color="--c-s2"
                            label={formatCount(row.rejected)}
                            labelWidth="w-8"
                          />
                        </td>
                        <td
                          className={`${TD} num text-muted whitespace-nowrap`}
                          title={formatTimestamp(row.lastRejectedAt)}
                        >
                          {ago(row.lastRejectedAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>
      </Row>

      <Row id="ruleSets" title={t('row.ruleSets')}>
        <Panel
          title={t('overview.ruleSetPanel')}
          description={`${t('overview.ruleSetHelp')} ${t('overview.thresholds')}`}
          state={{
            loading: !overview.data && !overview.error,
            error: overview.data ? undefined : overview.error,
            staleError: overview.data ? overview.error : undefined,
            empty: !!overview.data && sets.length === 0,
            onRetry: () => void overview.mutate(),
          }}
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
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr>
                  <th scope="col" className={TH}>
                    {t('col.ruleSet')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.rejectTrend')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('col.decisions')}
                  </th>
                  <th scope="col" className={`${TH} text-right`}>
                    {t('col.rejected')}
                  </th>
                  <th scope="col" className={`${TH} w-72`}>
                    {t('col.rejectRate')}
                  </th>
                  <th scope="col" className={TH}>
                    {t('col.lastDecision')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sets.map((set) => {
                  const severity = rateSeverity(set.rejectRate);
                  const selected = state.ruleSet === set.ruleSetId;
                  return (
                    <tr key={set.ruleSetId} className={selected ? 'bg-select' : 'hover:bg-panel2'}>
                      <td className={TD}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          onClick={() => update({ ruleSet: selected ? null : set.ruleSetId })}
                          className="mono text-s1-text rounded px-1 text-left hover:underline"
                        >
                          {set.ruleSetId}
                        </button>
                      </td>
                      <td className={TD}>
                        <Sparkline values={set.trend} />
                      </td>
                      <td className={`${TD} num text-right`}>{formatCount(set.total)}</td>
                      <td className={`${TD} num text-right`}>{formatCount(set.rejected)}</td>
                      <td className={TD}>
                        <div className="flex items-center gap-2">
                          <SeverityIcon severity={severity} />
                          <div className="flex-1">
                            <BarGauge
                              value={set.rejectRate}
                              max={RATE_SCALE}
                              color={severityMark(severity)}
                              label={formatPercent(set.rejectRate)}
                              markers={[WARN_RATE, BAD_RATE]}
                            />
                          </div>
                        </div>
                      </td>
                      <td
                        className={`${TD} num text-muted whitespace-nowrap`}
                        title={set.lastDecisionAt ? formatTimestamp(set.lastDecisionAt) : undefined}
                      >
                        {ago(set.lastDecisionAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted flex items-center gap-1.5 px-3 py-2 text-xs">
            <span aria-hidden className="bg-fg2 inline-block h-3 w-px" />
            {t('overview.thresholds')}
          </p>
        </Panel>
      </Row>
    </div>
  );
}
