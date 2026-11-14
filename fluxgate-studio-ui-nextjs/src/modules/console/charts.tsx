'use client';

import React, { useEffect, useRef, useState } from 'react';

import uPlot from 'uplot';

import { formatCount } from '@/lib/format';
import { legendStats } from '@/lib/stats';
import { useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';

import 'uplot/dist/uPlot.min.css';

export interface SeriesSpec {
  label: string;
  color: string;
  values: number[];
}

interface Hover {
  idx: number;
  left: number;
  top: number;
  flip: boolean;
}

function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#8e9196';
}

function translucent(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}26` : color;
}

function toData(times: number[], series: SeriesSpec[]): uPlot.AlignedData {
  return [times.map((time) => time / 1000), ...series.map((spec) => spec.values)];
}

export function TimeSeries({
  times,
  series,
  height = 220,
  syncKey,
  onZoom,
  formatTime,
  formatTooltipTime,
}: {
  times: number[];
  series: SeriesSpec[];
  height?: number;
  syncKey?: string;
  onZoom?: (from: number, to: number) => void;
  formatTime: (timestamp: number) => string;
  formatTooltipTime?: (timestamp: number) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const latest = useRef({ times, series, onZoom, formatTime });
  const [hover, setHover] = useState<Hover | null>(null);
  const { mode } = useTheme();
  const signature = series.map((spec) => `${spec.label}:${spec.color}`).join('|');

  useEffect(() => {
    latest.current = { times, series, onZoom, formatTime };
    chart.current?.setData(toData(times, series));
  }, [times, series, onZoom, formatTime]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const initial = latest.current;
    const axis = {
      stroke: token('--c-muted'),
      grid: { stroke: token('--c-grid'), width: 1 },
      ticks: { show: false },
      font: '11px system-ui, sans-serif',
    };
    const plot = new uPlot(
      {
        width: element.clientWidth,
        height,
        legend: { show: false },
        cursor: {
          sync: syncKey ? { key: syncKey } : undefined,
          drag: { x: true, y: false, setScale: false },
          points: { size: 7 },
        },
        scales: { x: { time: true } },
        axes: [
          {
            ...axis,
            values: (_plot, splits) =>
              splits.map((split) => latest.current.formatTime(split * 1000)),
          },
          { ...axis, size: 48 },
        ],
        series: [
          {},
          ...initial.series.map((spec) => {
            const color = token(spec.color);
            return {
              label: spec.label,
              stroke: color,
              width: 2,
              fill: translucent(color),
              points: { show: false },
            };
          }),
        ],
        hooks: {
          setSelect: [
            (u) => {
              const zoom = latest.current.onZoom;
              if (zoom && u.select.width > 4) {
                zoom(
                  Math.round(u.posToVal(u.select.left, 'x') * 1000),
                  Math.round(u.posToVal(u.select.left + u.select.width, 'x') * 1000)
                );
              }
              u.setSelect({ left: 0, top: 0, width: 0, height: 0 }, false);
            },
          ],
          setCursor: [
            (u) => {
              const { idx, left, top } = u.cursor;
              if (idx == null || left == null || left < 0) {
                setHover(null);
                return;
              }
              setHover({
                idx,
                left: left + u.over.offsetLeft,
                top: (top ?? 0) + u.over.offsetTop,
                flip: left > u.over.clientWidth * 0.6,
              });
            },
          ],
        },
      },
      toData(initial.times, initial.series),
      element
    );
    chart.current = plot;
    const observer = new ResizeObserver(() => plot.setSize({ width: element.clientWidth, height }));
    observer.observe(element);
    return () => {
      observer.disconnect();
      plot.destroy();
      chart.current = null;
    };
  }, [mode, height, syncKey, signature]);

  const tooltipTime = formatTooltipTime ?? formatTime;
  const point = hover !== null && times[hover.idx] !== undefined ? hover : null;

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div ref={host} />
      {point && (
        <div
          className="border-line bg-panel2 pointer-events-none absolute z-10 min-w-32 rounded border px-2 py-1.5 text-[11px] shadow-lg"
          style={{
            left: point.left,
            top: Math.max(0, point.top - 12),
            transform: point.flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="num text-muted mb-1">{tooltipTime(times[point.idx])}</div>
          {series.map((spec) => (
            <div key={spec.label} className="flex items-center gap-2">
              <span
                className="inline-block h-0.5 w-3"
                style={{ background: `var(${spec.color})` }}
              />
              <span className="text-fg2">{spec.label}</span>
              <span className="num text-fg ml-auto">
                {formatCount(spec.values[point.idx] ?? 0)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Legend({ series }: { series: SeriesSpec[] }) {
  const { t } = useI18n();
  const head = 'px-2 py-1 text-right font-normal text-muted';
  return (
    <table className="mt-1 w-full text-xs">
      <thead>
        <tr>
          <th className="text-muted px-2 py-1 text-left font-normal">{t('legend.series')}</th>
          <th className={head}>{t('legend.mean')}</th>
          <th className={head}>{t('legend.max')}</th>
          <th className={head}>{t('legend.last')}</th>
        </tr>
      </thead>
      <tbody>
        {series.map((spec) => {
          const stats = legendStats(spec.values);
          return (
            <tr key={spec.label}>
              <td className="px-2 py-0.5">
                <span
                  className="mr-2 inline-block h-0.5 w-3 align-middle"
                  style={{ background: `var(${spec.color})` }}
                />
                {spec.label}
              </td>
              <td className="num px-2 text-right">{stats.mean.toFixed(1)}</td>
              <td className="num px-2 text-right">{formatCount(stats.max)}</td>
              <td className="num px-2 text-right">{formatCount(stats.last)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Sparkline({
  values,
  color = '--c-s2',
  width = 72,
  height = 16,
  area = false,
  stretch = false,
  className = '',
}: {
  values: number[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  const w = stretch ? 100 : width;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const coords = values.map(
    (value, index) =>
      `${(index * step).toFixed(2)},${(height - 1 - (value / max) * (height - 2)).toFixed(2)}`
  );
  const active = values.some((value) => value > 0);
  const stroke = active ? `var(${color})` : 'var(--c-faint)';
  return (
    <svg
      viewBox={`0 0 ${w} ${height}`}
      width={stretch ? '100%' : width}
      height={height}
      preserveAspectRatio="none"
      aria-hidden
      className={className}
    >
      {area && coords.length > 1 && (
        <polygon
          points={`0,${height} ${coords.join(' ')} ${w},${height}`}
          fill={stroke}
          opacity={0.15}
        />
      )}
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function BarGauge({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color: string;
  label: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="bg-panel2 h-2 flex-1 overflow-hidden rounded-sm">
        <div
          className="h-full rounded-sm"
          style={{ width: `${ratio * 100}%`, background: `var(${color})` }}
        />
      </div>
      <span className="num w-14 text-right">{label}</span>
    </div>
  );
}
