import { describe, expect, it } from 'vitest';

import {
  apiRangeParams,
  DEFAULT_RANGE,
  MIN_SPAN,
  parseState,
  rangeKey,
  rangeLabel,
  refreshMillis,
  serializeState,
  zoomOut,
  zoomTo,
} from './timeRange';

const NOW = 1_794_600_000_000;
const HOUR = 3_600_000;

describe('dashboard state in the address', () => {
  it('falls back to the last hour with a ten second refresh', () => {
    expect(parseState(new URLSearchParams())).toEqual({
      range: DEFAULT_RANGE,
      refresh: '10s',
      ruleSet: null,
    });
  });

  it('reads presets, absolute ranges and the rule set', () => {
    expect(parseState(new URLSearchParams('from=now-6h&to=now&refresh=off&ruleSet=a'))).toEqual({
      range: { kind: 'relative', preset: '6h' },
      refresh: 'off',
      ruleSet: 'a',
    });
    expect(parseState(new URLSearchParams(`from=${NOW - HOUR}&to=${NOW}`)).range).toEqual({
      kind: 'absolute',
      from: NOW - HOUR,
      to: NOW,
    });
  });

  it('ignores values it cannot use', () => {
    expect(parseState(new URLSearchParams('from=now-2h&refresh=5s')).range).toEqual(DEFAULT_RANGE);
    expect(parseState(new URLSearchParams('from=now-2h&refresh=5s')).refresh).toBe('10s');
    expect(parseState(new URLSearchParams(`from=${NOW}&to=${NOW - 1}`)).range).toEqual(
      DEFAULT_RANGE
    );
    expect(parseState(new URLSearchParams(`from=${NOW - 25 * HOUR}&to=${NOW}`)).range).toEqual(
      DEFAULT_RANGE
    );
  });

  it('writes the state back and keeps unrelated parameters', () => {
    const params = serializeState(
      { range: { kind: 'absolute', from: 1, to: 2 }, refresh: '30s', ruleSet: null },
      new URLSearchParams('kiosk=&ruleSet=old')
    );
    expect(params.get('from')).toBe('1');
    expect(params.get('to')).toBe('2');
    expect(params.get('refresh')).toBe('30s');
    expect(params.has('ruleSet')).toBe(false);
    expect(params.has('kiosk')).toBe(true);
    expect(serializeState({ range: DEFAULT_RANGE, refresh: '10s', ruleSet: 'a' }).toString()).toBe(
      'from=now-1h&to=now&refresh=10s&ruleSet=a'
    );
  });
});

describe('API parameters and refresh', () => {
  it('sends presets as a window and absolute ranges as from and to', () => {
    expect(apiRangeParams({ kind: 'relative', preset: '15m' })).toEqual({ window: '15m' });
    expect(apiRangeParams({ kind: 'absolute', from: 1, to: 2 })).toEqual({ from: '1', to: '2' });
    expect(rangeKey({ kind: 'absolute', from: 1, to: 2 })).toBe('1-2');
  });

  it('refreshes only relative ranges', () => {
    expect(refreshMillis({ range: DEFAULT_RANGE, refresh: '30s', ruleSet: null })).toBe(30_000);
    expect(refreshMillis({ range: DEFAULT_RANGE, refresh: 'off', ruleSet: null })).toBe(0);
    expect(
      refreshMillis({ range: { kind: 'absolute', from: 1, to: 2 }, refresh: '10s', ruleSet: null })
    ).toBe(0);
  });
});

describe('zoom', () => {
  it('keeps a selection of at least one minute that ends by now', () => {
    expect(zoomTo(NOW - 10_000, NOW - 5_000, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - MIN_SPAN,
      to: NOW,
    });
    expect(zoomTo(NOW - HOUR, NOW - HOUR + 2 * MIN_SPAN, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - HOUR,
      to: NOW - HOUR + 2 * MIN_SPAN,
    });
  });

  it('steps presets up and doubles absolute ranges', () => {
    expect(zoomOut({ kind: 'relative', preset: '1h' }, NOW)).toEqual({
      kind: 'relative',
      preset: '6h',
    });
    expect(zoomOut({ kind: 'relative', preset: '24h' }, NOW)).toEqual({
      kind: 'relative',
      preset: '24h',
    });
    expect(zoomOut({ kind: 'absolute', from: NOW - 2 * HOUR, to: NOW - HOUR }, NOW)).toEqual({
      kind: 'absolute',
      from: NOW - 2.5 * HOUR,
      to: NOW - 0.5 * HOUR,
    });
    expect(zoomOut({ kind: 'absolute', from: NOW - 20 * HOUR, to: NOW }, NOW)).toEqual({
      kind: 'relative',
      preset: '24h',
    });
  });

  it('labels presets in the chosen language', () => {
    expect(rangeLabel({ kind: 'relative', preset: '1h' }, 'ko')).toBe('최근 1시간');
    expect(rangeLabel({ kind: 'relative', preset: '15m' }, 'en')).toBe('Last 15 min');
  });
});
