# Decision event explorer (0.5.0 candidate)

The ADMIN-only `/api/events` endpoint reads the configured MongoDB decision-event
collection. It is not the Studio audit log, synthetic demo traffic, or a live
request counter. The writer is the engine's `MongoRateLimitMetricsRecorder`: epoch-ms
`timestamp`, boolean `allowed`, `ruleSetId`, `ruleId`, `remainingTokens`, and
`retryAfterMs`. MongoDB-generated ObjectId `_id` provides the pagination tie-breaker.
The default is `rate_limit_events` in the configured FluxGate Mongo database;
existing `fluxgate.studio.monitoring.event-database` and `event-collection` overrides
are honored. There is no client-selected database or collection.

`GET /api/events?from=...&to=...&outcome=REJECT&limit=50` requires epoch milliseconds,
with inclusive from / exclusive to and a maximum 24-hour interval. Outcome is
optional (`ALLOW` or `REJECT`). Limit is 1–100. The response contains `items` and
an opaque `nextCursor`; use it with exactly the same time/result filters. Changing
filters must discard the cursor. Results sort by timestamp and ObjectId descending,
with no offset or full collection count. Limits read at most limit+1 rows. Cursor
contents are bounded, validated seek positions, not authentication credentials.

Only integer timestamps, boolean decisions and ObjectId identifiers are supported.
Malformed/imported records of other types are excluded, never reported as rejected
decisions. Optional numeric fields remain null when absent, not invented zeroes.
Rule identifiers are display-only, truncated server-side to 256 codepoints. The
response deliberately omits IP/user/API keys, endpoint/query strings, headers and
arbitrary attributes. ADMIN authorization is enforced in both Spring security and
the controller, not merely by hiding a UI link.

## Operational boundaries

- Mongo server execution has a maxTime budget no greater than 5 seconds and disallows disk spill.
  Connection selection, network and pool waits are separately governed by the Mongo client
  settings; this is not a five-second end-to-end request deadline.
  Backend failure is an error, never a fabricated empty page.
- This feature performs no writes, index creation, deletion or TTL changes. Existing
  monitoring startup index behavior is unchanged. Review and disable the existing
  create-indexes option if using a read-only DB principal.
- Before rollout, operators should independently review an appropriate compound
  index `{timestamp:-1,_id:-1}` and, for filtered workloads, an appropriate
  `{allowed:1,timestamp:-1,_id:-1}` index. No production index is created here.
  The existing timestamp-only index may need an in-memory tie-break sort. A bounded
  time range is not proof of a bounded number of source documents or cheap queries;
  timeout can still occur under high traffic. Measure against representative data.
- Pagination is a live read, not a snapshot. Late writes, TTL expiry and concurrent
  removal may change subsequent pages. Keep a fixed end time; refresh starts over.
- Missing history does not prove missing traffic: recording may be disabled,
  sampled, delayed, dropped or expired by existing retention. No uptime or complete
  accounting claim is made. No production database was accessed for this change.
- Keep UI/API revisions paired; old APIs do not have this endpoint. The candidate
  remains based on Studio #8, not the separately deployed legacy demo UI.

## Validation scope

Synthetic unit/security fixtures cover filter limits, cursor validation and ADMIN
isolation. Testcontainers scenarios use an isolated MongoDB, including equal-time
pagination, allow/reject filtering, omitted secrets and unchanged document counts.
These are tests to run, not a declaration that this candidate passed or has been
validated against real operational data. See the PR for exact executed results.
