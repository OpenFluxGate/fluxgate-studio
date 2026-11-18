/** Query state is a fixed interval: cursor requests never slide the time window. */
export interface DecisionEventQuery {
  from: number;
  to: number;
  outcome?: 'ALLOW' | 'REJECT';
  limit?: number;
  cursor?: string;
}

export function decisionEventParams(query: DecisionEventQuery): URLSearchParams {
  if (
    !Number.isSafeInteger(query.from) ||
    !Number.isSafeInteger(query.to) ||
    query.from < 0 ||
    query.to <= query.from ||
    query.to - query.from > 86_400_000
  ) {
    throw new Error('Invalid event interval: use a positive range of at most 24 hours.');
  }
  const limit = query.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid page size.');
  if (query.outcome && !['ALLOW', 'REJECT'].includes(query.outcome))
    throw new Error('Invalid outcome.');
  const params = new URLSearchParams({
    from: String(query.from),
    to: String(query.to),
    limit: String(limit),
  });
  if (query.outcome) params.set('outcome', query.outcome);
  if (query.cursor) params.set('cursor', query.cursor);
  return params;
}

/** The store excludes its upper bound; include decisions stamped in the current millisecond. */
export function lastHour(now = Date.now()): DecisionEventQuery {
  const to = now + 1;
  return { from: to - 3_600_000, to, limit: 50 };
}

export function localDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  return new Date(timestamp - date.getTimezoneOffset() * 60_000).toISOString().slice(0, -1);
}
