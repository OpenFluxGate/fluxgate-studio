import { formatDateTime } from './format';
import { type Locale, type MessageKey, translate } from './i18n';

export const PRESETS = ['5m', '15m', '1h', '6h', '24h'] as const;
export type Preset = (typeof PRESETS)[number];

export const REFRESH_OPTIONS = ['off', '10s', '30s', '1m'] as const;
export type RefreshInterval = (typeof REFRESH_OPTIONS)[number];

export type TimeRange =
  | { kind: 'relative'; preset: Preset }
  | { kind: 'absolute'; from: number; to: number };

export interface DashboardState {
  range: TimeRange;
  refresh: RefreshInterval;
  ruleSet: string | null;
}

export const DEFAULT_RANGE: TimeRange = { kind: 'relative', preset: '1h' };
export const MIN_SPAN = 60_000;
export const MAX_SPAN = 24 * 60 * 60 * 1000;

const DEFAULT_REFRESH: RefreshInterval = '10s';
const REFRESH_MILLIS: Record<RefreshInterval, number> = {
  off: 0,
  '10s': 10_000,
  '30s': 30_000,
  '1m': 60_000,
};

function isPreset(value: string): value is Preset {
  return (PRESETS as readonly string[]).includes(value);
}

function isRefresh(value: string | null): value is RefreshInterval {
  return value !== null && (REFRESH_OPTIONS as readonly string[]).includes(value);
}

export function parseState(params: URLSearchParams): DashboardState {
  const from = params.get('from');
  const to = params.get('to');
  let range: TimeRange = DEFAULT_RANGE;
  const relative = from?.match(/^now-(\w+)$/);
  if (relative && (to === null || to === 'now') && isPreset(relative[1])) {
    range = { kind: 'relative', preset: relative[1] };
  } else if (from && to && /^\d+$/.test(from) && /^\d+$/.test(to)) {
    const start = Number(from);
    const end = Number(to);
    if (start < end && end - start <= MAX_SPAN) {
      range = { kind: 'absolute', from: start, to: end };
    }
  }
  const refresh = params.get('refresh');
  return {
    range,
    refresh: isRefresh(refresh) ? refresh : DEFAULT_REFRESH,
    ruleSet: params.get('ruleSet') || null,
  };
}

export function serializeState(
  state: DashboardState,
  base: URLSearchParams = new URLSearchParams()
): URLSearchParams {
  const params = new URLSearchParams(base);
  if (state.range.kind === 'relative') {
    params.set('from', `now-${state.range.preset}`);
    params.set('to', 'now');
  } else {
    params.set('from', String(state.range.from));
    params.set('to', String(state.range.to));
  }
  params.set('refresh', state.refresh);
  if (state.ruleSet) params.set('ruleSet', state.ruleSet);
  else params.delete('ruleSet');
  return params;
}

export function apiRangeParams(range: TimeRange): Record<string, string> {
  return range.kind === 'relative'
    ? { window: range.preset }
    : { from: String(range.from), to: String(range.to) };
}

export function rangeKey(range: TimeRange): string {
  return range.kind === 'relative' ? range.preset : `${range.from}-${range.to}`;
}

export function refreshMillis(state: DashboardState): number {
  return state.range.kind === 'absolute' ? 0 : REFRESH_MILLIS[state.refresh];
}

export function zoomTo(from: number, to: number, now: number): TimeRange {
  let start = Math.min(from, to);
  let end = Math.min(Math.max(from, to), now);
  if (end - start < MIN_SPAN) {
    const center = (start + end) / 2;
    start = Math.round(center - MIN_SPAN / 2);
    end = start + MIN_SPAN;
  }
  if (end > now) {
    start -= end - now;
    end = now;
  }
  return { kind: 'absolute', from: start, to: end };
}

export function zoomOut(range: TimeRange, now: number): TimeRange {
  if (range.kind === 'relative') {
    const index = PRESETS.indexOf(range.preset);
    return { kind: 'relative', preset: PRESETS[Math.min(index + 1, PRESETS.length - 1)] };
  }
  const span = (range.to - range.from) * 2;
  if (span >= MAX_SPAN) {
    return { kind: 'relative', preset: '24h' };
  }
  const center = (range.from + range.to) / 2;
  const end = Math.min(now, Math.round(center + span / 2));
  return { kind: 'absolute', from: end - span, to: end };
}

export function rangeLabel(range: TimeRange, locale: Locale): string {
  if (range.kind === 'relative') {
    return translate(locale, 'range.last', {
      window: translate(locale, `window.${range.preset}` as MessageKey),
    });
  }
  return translate(locale, 'range.absolute', {
    from: formatDateTime(range.from),
    to: formatDateTime(range.to),
  });
}
