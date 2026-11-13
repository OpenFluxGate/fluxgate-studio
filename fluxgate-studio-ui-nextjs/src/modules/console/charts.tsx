import React from 'react';

import { type ApiBucket } from '@/lib/api';

export function StackedBars({
  buckets,
  height = 120,
  describe,
}: {
  buckets: ApiBucket[];
  height?: number;
  describe: (bucket: ApiBucket) => string;
}) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.allowed + bucket.rejected));
  return (
    <div className="flex items-end gap-px" style={{ height }}>
      {buckets.map((bucket) => {
        const total = bucket.allowed + bucket.rejected;
        return (
          <div
            key={bucket.start}
            title={describe(bucket)}
            className="bg-bar/60 hover:bg-bar relative flex-1"
            style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? 1 : 0 }}
          >
            <div
              className="bg-bad absolute inset-x-0 bottom-0"
              style={{ height: total ? `${(bucket.rejected / total) * 100}%` : 0 }}
            />
          </div>
        );
      })}
    </div>
  );
}

export function Sparkline({
  values,
  width = 72,
  height = 16,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const points = values
    .map(
      (value, index) =>
        `${(index * step).toFixed(1)},${(height - 1 - (value / max) * (height - 2)).toFixed(1)}`
    )
    .join(' ');
  const active = values.some((value) => value > 0);
  return (
    <svg width={width} height={height} aria-hidden className={active ? 'text-bad' : 'text-faint'}>
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth={1.2} />
    </svg>
  );
}
