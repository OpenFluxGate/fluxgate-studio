# Decision event explorer (0.5.0 candidate)

[한국어](decision-event-explorer.ko.md)

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
with no offset or full collection count. The aggregation returns up to limit+1 rows to the API. MongoDB can examine many more. Cursor
contents are bounded, validated seek positions, not authentication credentials.

Only integer timestamps, boolean decisions and ObjectId identifiers are supported.
Malformed/imported records of other types are excluded, never reported as rejected
decisions. The optional writer counters accept BSON int32 and int64. Other types or missing values appear as null.
Rule identifiers are display-only, truncated server-side to 256 codepoints. The
response deliberately omits IP/user/API keys, endpoint/query strings, headers and
arbitrary attributes. ADMIN authorization is enforced in both Spring security and
the controller, not merely by hiding a UI link.

## Operational boundaries

- The event aggregation uses a MongoDB driver operation budget of at most 5 seconds.
  It covers server selection, connection checkout, command execution and cursor reads.
  A shorter inherited operation timeout still applies. MongoDB cannot spill this query
  to disk. A database failure returns HTTP 503. HTTP and application overhead can
  add time outside the database operation.
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

## Provisioning the explorer indexes

Confirm that Studio points to the same database and collection as the service
writer configured with `fluxgate.mongo.event-collection`. Inspect existing
indexes and arrange the following index builds through the database owner.
Example for mongosh after selecting the writer database and default collection:

```javascript
const events = db.getCollection("rate_limit_events");
events.getIndexes();
events.createIndex({timestamp: -1, _id: -1});
events.createIndex({allowed: 1, timestamp: -1, _id: -1});
```

Allow for the storage and write cost of both indexes. Check executionStats for
first and continuation pages with and without an outcome filter. Inspect the
winning index, any blocking SORT, keys and documents examined per returned row,
and elapsed time. An IXSCAN on timestamp alone may still read the entire window.
The cursor's explicit timestamp upper bound allows seeking directly to its
millisecond. Many records at the same millisecond or malformed records can still
increase work. Index provisioning is independent of Studio startup and rollout.

## Validation scope

Synthetic unit/security fixtures cover filter limits, cursor validation and ADMIN
isolation. Testcontainers scenarios use an isolated MongoDB, including equal-time
pagination, allow/reject filtering, omitted secrets and unchanged document counts.
These are tests to run, not a declaration that this candidate passed or has been
validated against real operational data. See the PR for exact executed results.
