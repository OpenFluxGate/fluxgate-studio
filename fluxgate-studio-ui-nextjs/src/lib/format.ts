import { type Locale, translate } from './i18n';

export function formatAgo(timestamp: number, now: number, locale: Locale): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return translate(locale, 'ago.seconds', { n: seconds });
  if (seconds < 3600) return translate(locale, 'ago.minutes', { n: Math.floor(seconds / 60) });
  if (seconds < 86400) return translate(locale, 'ago.hours', { n: Math.floor(seconds / 3600) });
  return translate(locale, 'ago.days', { n: Math.floor(seconds / 86400) });
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

const pad = (value: number) => String(value).padStart(2, '0');

export function formatClock(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatBucket(millis: number): string {
  return millis < 60_000 ? `${millis / 1000}s` : `${millis / 60_000}m`;
}

export function formatHourMinute(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${formatClock(timestamp)}`;
}

export function formatMonthDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
