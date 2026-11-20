export type Severity = 'ok' | 'warn' | 'bad';

export const WARN_RATE = 0.01;
export const BAD_RATE = 0.05;

interface BucketLike {
  allowed: number;
  rejected: number;
}

export function summarize(buckets: BucketLike[]): {
  total: number;
  rejected: number;
  rate: number;
} {
  let allowed = 0;
  let rejected = 0;
  for (const bucket of buckets) {
    allowed += bucket.allowed;
    rejected += bucket.rejected;
  }
  const total = allowed + rejected;
  return { total, rejected, rate: total ? rejected / total : 0 };
}

export function rateSeverity(rate: number): Severity {
  if (rate >= BAD_RATE) return 'bad';
  if (rate >= WARN_RATE) return 'warn';
  return 'ok';
}

export function legendStats(values: number[]): { mean: number; max: number; last: number } {
  if (values.length === 0) return { mean: 0, max: 0, last: 0 };
  const sum = values.reduce((acc, value) => acc + value, 0);
  return { mean: sum / values.length, max: Math.max(...values), last: values[values.length - 1] };
}

export function bucketRates(buckets: BucketLike[]): number[] {
  return buckets.map((bucket) => {
    const total = bucket.allowed + bucket.rejected;
    return total ? (bucket.rejected / total) * 100 : 0;
  });
}
