'use client';

import React, { useState } from 'react';
import Link from 'next/link';

import { ExternalLink } from 'lucide-react';

import { fetchDashboardStats, fetchOverview, fetchTimeseries, fetchTopRejected } from '@/lib/api';
import { formatAgo, formatClock, formatCount, formatPercent } from '@/lib/format';

import { Sparkline, StackedBars } from '../charts';
import { useI18n } from '../I18nProvider';
import { useMe } from '../MeProvider';
import { LiveStatus, Notice, PageHeader, Panel, StatTile, TD, TH, WindowPicker } from '../ui';
import { useLive, useNow } from '../useLive';

const WINDOWS = ['5m', '1h', '24h'] as const;
type Range = (typeof WINDOWS)[number];

export function OverviewScreen() {
  const { t, locale } = useI18n();
  const { isAdmin } = useMe();
  const now = useNow();
  const [range, setRange] = useState<Range>('1h');

  const overview = useLive(`overview:${range}`, () => fetchOverview({ window: range }));
  const series = useLive(`series:${range}`, () => fetchTimeseries({ window: range }));
  const top = useLive(`top:${range}`, () => fetchTopRejected({ window: range }, 10));
  const stats = useLive('stats', fetchDashboardStats);

  const data = overview.data;
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
            className="text-fg2 inline-flex items-center gap-1 text-xs underline"
          >
            {t('overview.external')}
            <ExternalLink size={12} />
          </a>
        )}
        <LiveStatus updatedAt={overview.updatedAt} error={overview.error} />
        <WindowPicker value={range} options={WINDOWS} onChange={setRange} />
      </PageHeader>

      {overview.error && !data && (
        <Notice tone="bad">{String((overview.error as Error).message)}</Notice>
      )}
      {data && data.total === 0 && data.ruleSets.every((set) => set.lastDecisionAt === null) && (
        <Notice>{t('overview.noEvents')}</Notice>
      )}

      <div className="mb-2 grid grid-cols-2 gap-2 md:grid-cols-5">
        <StatTile label={t('overview.decisions')} value={data ? formatCount(data.total) : '–'} />
        <StatTile
          label={t('overview.rejected')}
          value={data ? formatCount(data.rejected) : '–'}
          tone={data && data.rejected > 0 ? 'bad' : undefined}
        />
        <StatTile
          label={t('overview.rejectRate')}
          value={data ? formatPercent(data.rejectRate) : '–'}
        />
        <StatTile
          label={t('overview.activeRules')}
          value={stats.data ? `${stats.data.activeRules}/${stats.data.totalRules}` : '–'}
        />
        <StatTile
          label={t('overview.ruleSets')}
          value={stats.data ? String(stats.data.totalRuleSets) : '–'}
        />
      </div>

      <div className="mb-2 grid items-start gap-2 lg:grid-cols-3">
        <Panel title={t('overview.trend')} className="lg:col-span-2">
          <div className="p-3">
            <StackedBars
              buckets={series.data?.buckets ?? []}
              height={150}
              describe={(bucket) =>
                `${formatClock(bucket.start)}  ${t('decision.allowed')} ${bucket.allowed} · ${t('decision.rejected')} ${bucket.rejected}`
              }
            />
          </div>
        </Panel>
        <Panel title={t('overview.topRejected')}>
          <table className="w-full">
            <thead>
              <tr>
                <th className={TH}>{t('col.key')}</th>
                <th className={TH}>{t('col.ruleSet')}</th>
                <th className={`${TH} text-right`}>{t('col.rejected')}</th>
                <th className={TH}>{t('col.lastRejected')}</th>
              </tr>
            </thead>
            <tbody>
              {(top.data ?? []).map((row) => (
                <tr key={`${row.ruleSetId}:${row.key}`}>
                  <td className={`${TD} num`}>
                    {isAdmin && !row.masked ? (
                      <Link
                        href={`/keys?value=${encodeURIComponent(row.key)}&transform=none`}
                        className="underline"
                      >
                        {row.key}
                      </Link>
                    ) : (
                      row.key
                    )}
                  </td>
                  <td className={`${TD} num text-fg2`}>{row.ruleSetId}</td>
                  <td className={`${TD} num text-bad text-right`}>{formatCount(row.rejected)}</td>
                  <td className={`${TD} text-muted`}>{ago(row.lastRejectedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title={t('col.ruleSet')}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={TH}>{t('col.ruleSet')}</th>
              <th className={TH}>{t('col.trend')}</th>
              <th className={`${TH} text-right`}>{t('col.decisions')}</th>
              <th className={`${TH} text-right`}>{t('col.rejected')}</th>
              <th className={`${TH} text-right`}>{t('col.rejectRate')}</th>
              <th className={TH}>{t('col.lastDecision')}</th>
            </tr>
          </thead>
          <tbody>
            {(data?.ruleSets ?? []).map((set) => (
              <tr key={set.ruleSetId}>
                <td className={`${TD} num`}>{set.ruleSetId}</td>
                <td className={TD}>
                  <Sparkline values={set.trend} />
                </td>
                <td className={`${TD} num text-right`}>{formatCount(set.total)}</td>
                <td className={`${TD} num text-right ${set.rejected > 0 ? 'text-bad' : ''}`}>
                  {formatCount(set.rejected)}
                </td>
                <td className={`${TD} num text-right`}>{formatPercent(set.rejectRate)}</td>
                <td className={`${TD} text-muted`}>{ago(set.lastDecisionAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
