'use client';

import React, { useEffect, useRef, useState } from 'react';

import uPlot from 'uplot';

import { formatCount, formatHourMinute, formatMonthDay } from '@/lib/format';
import { legendStats } from '@/lib/stats';
import { useTheme } from '@/modules/admin';

import { useI18n } from './I18nProvider';

import 'uplot/dist/uPlot.min.css';

export interface SeriesSpec {
  label: string;
  color: string;
  values: (number | null)[];
}

export interface Annotation {
  time: number;
  text: string;
}

interface Hover {
  idx: number;
  left: number;
  top: number;
  flip: boolean;
}

/** Annotations closer than this many pixels share one marker. */
const MARKER_GAP = 12;

interface Marker {
  left: number;
  top: number;
  notes: Annotation[];
}

/** Groups annotations that would overlap on screen into one marker. */
export function clusterAnnotations(
  positions: { x: number; note: Annotation }[],
  gap = MARKER_GAP
): { x: number; notes: Annotation[] }[] {
  const sorted = [...positions].sort((a, b) => a.x - b.x);
  const clusters: { x: number; notes: Annotation[] }[] = [];
  for (const { x, note } of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && x - last.x < gap) last.notes.push(note);
    else clusters.push({ x, notes: [note] });
  }
  return clusters;
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

/** Hour and minute ticks, with the date on the first tick and wherever the day changes. */
/** Whole number tick steps, because every series counts requests. */
const COUNT_INCREMENTS = [
  1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1_000, 2_000, 2_500, 5_000, 10_000, 20_000, 25_000,
  50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000, 10_000_000,
];

export function timeTicks(splits: number[]): string[] {
  return splits.map((split, index) => {
    const date = new Date(split * 1000);
    const previous = index > 0 ? new Date(splits[index - 1] * 1000) : null;
    const newDay = !previous || previous.getDate() !== date.getDate();
    const time = formatHourMinute(split * 1000);
    return newDay && index > 0 ? `${time}\n${formatMonthDay(split * 1000)}` : time;
  });
}

export function TimeSeries({
  times,
  series,
  height = 220,
  syncKey,
  onZoom,
  yLabel,
  bucketMillis,
  annotations = [],
  formatTooltipTime,
}: {
  times: number[];
  series: SeriesSpec[];
  height?: number;
  syncKey?: string;
  onZoom?: (from: number, to: number) => void;
  yLabel?: string;
  bucketMillis?: number;
  annotations?: Annotation[];
  formatTooltipTime: (timestamp: number) => string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chart = useRef<uPlot | null>(null);
  const latest = useRef({ times, series, onZoom, annotations });
  const [hover, setHover] = useState<Hover | null>(null);
  const [markers, setMarkers] = useState<Marker[]>([]);
  const { t } = useI18n();
  const { resolved } = useTheme();
  const signature = series.map((spec) => `${spec.label}:${spec.color}`).join('|');

  useEffect(() => {
    latest.current = { times, series, onZoom, annotations };
    chart.current?.setData(toData(times, series));
  }, [times, series, onZoom, annotations]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const initial = latest.current;
    const axis = {
      stroke: token('--c-muted'),
      grid: { stroke: token('--c-grid'), width: 1 },
      ticks: { show: false },
      font: '11px Inter, system-ui, sans-serif',
      labelFont: '11px Inter, system-ui, sans-serif',
    };
    const marker = token('--c-annotation');
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
        scales: { x: { time: true }, y: { range: (_u, _min, max) => [0, Math.max(1, max * 1.1)] } },
        axes: [
          { ...axis, space: 64, values: (_plot, splits) => timeTicks(splits) },
          {
            ...axis,
            size: 52,
            label: yLabel,
            labelSize: yLabel ? 16 : 0,
            incrs: COUNT_INCREMENTS,
            values: (_plot, splits) => splits.map((split) => formatCount(split)),
          },
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
              spanGaps: false,
              points: { show: false },
            };
          }),
        ],
        hooks: {
          draw: [
            (u) => {
              const positions = latest.current.annotations
                .map((note) => ({ x: u.valToPos(note.time / 1000, 'x'), note }))
                .filter(({ x }) => x >= 0 && x <= u.bbox.width / uPlot.pxRatio);
              const clusters = clusterAnnotations(positions);
              const context = u.ctx;
              context.save();
              context.strokeStyle = marker;
              context.lineWidth = 1.5 * uPlot.pxRatio;
              context.setLineDash([4 * uPlot.pxRatio, 4 * uPlot.pxRatio]);
              for (const cluster of clusters) {
                const x = u.bbox.left + cluster.x * uPlot.pxRatio;
                context.beginPath();
                context.moveTo(x, u.bbox.top);
                context.lineTo(x, u.bbox.top + u.bbox.height);
                context.stroke();
              }
              context.restore();
              const next = clusters.map((cluster) => ({
                left: u.over.offsetLeft + cluster.x,
                top: u.over.offsetTop,
                notes: cluster.notes,
              }));
              setMarkers((previous) =>
                JSON.stringify(previous) === JSON.stringify(next) ? previous : next
              );
            },
          ],
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
  }, [resolved, height, syncKey, signature, yLabel]);

  const point = hover !== null && times[hover.idx] !== undefined ? hover : null;
  const start = point ? times[point.idx] : 0;
  const notes = point
    ? annotations.filter(
        (note) => note.time >= start && note.time < start + (bucketMillis ?? 60_000)
      )
    : [];

  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div ref={host} />
      {markers.map((item) => (
        <span
          key={`${item.left}-${item.notes[0].time}`}
          className="group absolute z-20 -translate-x-1/2"
          style={{ left: item.left, top: item.top - 9 }}
        >
          <button
            type="button"
            aria-label={item.notes
              .map((note) => `${formatTooltipTime(note.time)} ${note.text}`)
              .join(', ')}
            className="bg-annotation text-bg flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-none font-semibold"
          >
            {item.notes.length > 1 ? item.notes.length : <MarkerGlyph inverted />}
          </button>
          <span
            role="tooltip"
            className="border-line-strong bg-panel2 pointer-events-none absolute top-5 left-1/2 z-30 hidden w-72 -translate-x-1/2 rounded-md border px-2.5 py-2 text-xs shadow-xl group-focus-within:block group-hover:block"
          >
            <span className="text-muted mb-1 block">
              {t('chart.annotations', { count: item.notes.length })}
            </span>
            {item.notes.map((note) => (
              <span key={`${note.time}-${note.text}`} className="mt-1 flex gap-1.5">
                <span className="num text-muted shrink-0">{formatTooltipTime(note.time)}</span>
                <span className="text-fg">{note.text}</span>
              </span>
            ))}
          </span>
        </span>
      ))}
      {markers.length > 0 && (
        <div className="text-muted flex items-center gap-1.5 px-1 pt-1 text-xs">
          <MarkerGlyph />
          {t('chart.annotations', {
            count: markers.reduce((sum, item) => sum + item.notes.length, 0),
          })}
        </div>
      )}
      {point && (
        <div
          role="status"
          className="border-line-strong bg-panel2 pointer-events-none absolute z-10 max-w-72 min-w-36 rounded-md border px-2.5 py-2 text-xs shadow-xl"
          style={{
            left: point.left,
            top: Math.max(0, point.top - 12),
            transform: point.flip ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
          }}
        >
          <div className="num text-muted mb-1">{formatTooltipTime(start)}</div>
          {series.map((spec) => {
            const value = spec.values[point.idx];
            return (
              <div key={spec.label} className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-0.5 w-3"
                  style={{ background: `var(${spec.color})` }}
                />
                <span className="text-fg2">{spec.label}</span>
                <span className="num text-fg ml-auto">
                  {value === null || value === undefined ? '…' : formatCount(value)}
                </span>
              </div>
            );
          })}
          {notes.map((note) => (
            <div
              key={`${note.time}-${note.text}`}
              className="border-line text-fg2 mt-1.5 flex gap-1.5 border-t pt-1.5"
            >
              <MarkerGlyph />
              {note.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small downward triangle in the annotation color. */
function MarkerGlyph({ inverted = false }: { inverted?: boolean }) {
  return (
    <svg
      aria-hidden
      width="8"
      height="7"
      viewBox="0 0 8 7"
      className={`mt-[3px] shrink-0 ${inverted ? 'fill-bg' : 'fill-annotation'}`}
    >
      <path d="M0 0h8L4 7z" />
    </svg>
  );
}

/** One line of mean, max and last for a series, shared by every chart panel. */
export function SeriesStats({
  values,
  unit,
  label,
  color,
}: {
  values: (number | null)[];
  unit: string;
  label?: string;
  color?: string;
}) {
  const { t } = useI18n();
  const stats = legendStats(values.filter((value): value is number => value !== null));
  return (
    <p className="num text-muted flex flex-wrap items-center gap-x-1 px-3 pb-2 text-xs">
      {label && (
        <span className="text-fg2 mr-1 inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0.5 w-3"
            style={{ background: `var(${color ?? '--c-s1'})` }}
          />
          {label}
        </span>
      )}
      {t('legend.mean')} <span className="text-fg2">{stats.mean.toFixed(1)}</span>
      <span aria-hidden> · </span>
      {t('legend.max')} <span className="text-fg2">{formatCount(stats.max)}</span>
      <span aria-hidden> · </span>
      {t('legend.last')} <span className="text-fg2">{formatCount(stats.last)}</span>
      <span className="ml-1">({unit})</span>
    </p>
  );
}

export function Sparkline({
  values,
  color = '--c-s2',
  width = 80,
  height = 18,
  area = false,
  stretch = false,
  className = '',
}: {
  values: (number | null)[];
  color?: string;
  width?: number;
  height?: number;
  area?: boolean;
  stretch?: boolean;
  className?: string;
}) {
  const w = stretch ? 100 : width;
  const known = values.filter((value): value is number => value !== null);
  const max = Math.max(1, ...known);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const coords: string[] = [];
  values.forEach((value, index) => {
    if (value !== null) {
      coords.push(
        `${(index * step).toFixed(2)},${(height - 1 - (value / max) * (height - 2)).toFixed(2)}`
      );
    }
  });
  const lastX = coords.length ? coords[coords.length - 1].split(',')[0] : '0';
  const active = known.some((value) => value > 0);
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
          points={`0,${height} ${coords.join(' ')} ${lastX},${height}`}
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

/** Horizontal gauge on a fixed scale with optional threshold ticks. */
export function BarGauge({
  value,
  max,
  color,
  label,
  markers = [],
  labelWidth = 'w-14',
}: {
  value: number;
  max: number;
  color: string;
  label: string;
  markers?: number[];
  labelWidth?: string;
}) {
  const ratio = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div className="bg-panel2 relative h-2 flex-1 rounded-sm">
        <div
          className="h-full rounded-sm"
          style={{ width: `${ratio * 100}%`, background: `var(${color})` }}
        />
        {markers.map((marker) => (
          <span
            key={marker}
            aria-hidden
            className="bg-fg2 absolute -top-0.5 h-3 w-px"
            style={{ left: `${Math.min(1, marker / max) * 100}%` }}
          />
        ))}
      </div>
      <span className={`num shrink-0 text-right ${labelWidth}`}>{label}</span>
    </div>
  );
}
