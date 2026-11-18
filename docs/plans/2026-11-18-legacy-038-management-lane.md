# Studio UI for 0.3.8 consumers: compatibility lane proposal

Status: design only; not implemented, not deployable. This is not a replacement for the production activation hold. Baseline: Studio 06e9be9655f29f764d7758df83713578f884b8e5 and its paired core 39a1789acfc481e416e7363dc6e9dd3817b147b5.

## Goal and exclusions

Deliver the new monitoring UI while existing services keep the published Redis module 0.3.8 and their actual core/Mongo/starter dependencies. The expected published core/Mongo version is 0.3.7; capture the consumer dependency tree before asserting a particular deployment's versions.

A read-only dashboard is useful as an optional preview but is NOT a functionally equivalent release: existing rule create/edit/toggle/delete/import must remain available in a full management replacement. Do not silently disable these features and label the result complete.

Do not migrate rule identity, indexes, policy publication semantics, bucket key formats, counter epochs, or existing readers. Do not add public ACL enforcement claims for legacy SDKs. Do not change AWS, credentials, database indexes, or the production hold as part of this proposal.

## Distinct deployment cases

1. **Legacy SDK readers, one new management writer:** basic Mongo rule reads may interoperate, but startup, mutation BSON, reload delivery, quota/reset behavior and events require exact-version end-to-end proof.
2. **Legacy SDK readers plus old management writers:** a separate risk. Old replacement writes do not preserve new fields or concurrency metadata. Do not claim safe mixed writers from reader compatibility. Either retain exactly the old schema and explicitly prove conflict behavior, or require a coordinated single-writer cutover. Restricting existing writers is a separate operational decision, not something this lane silently performs.
3. **New published-policy consumers:** separate from legacy mutable rule readers. Publishing immutable snapshots does not update legacy readers' authoritative mutable data. Publication and rollback cannot be presented as effective legacy actions.
4. **New UI with old API:** not a drop-in combination. Main has Dashboard/Rule/Policy controllers but lacks new me, monitoring, keys, audit and branding endpoints.

## Smallest credible full-feature implementation

Use a separate, opt-in legacy management API lane paired with the new UI, rather than downgrading the entire PR's dependency version or running schema migration.

- Isolate the legacy lane from FluxGate 0.5 Mongo/policy auto-configuration. `ddl-auto=none` alone is insufficient: `MongoStudioRuleRepository` calls `ensureIndexes()` directly in its constructor. `MonitoringConfig` and `SettingsConfig` also depend on the 0.5 client holder and need an explicit owned-client abstraction for this lane.
- Provide a dedicated legacy repository with globally unique rule IDs. Inspect existing index metadata without DDL; fail closed on duplicate IDs or unexpected newer scoped data. Never drop or replace an existing index to make startup pass. Preserve current rule-set normalization semantics verified against published 0.3.7 artifacts.
- Use exact legacy BSON round-trip fixtures. Preserve unknown fields on edits; do not start populating new ACL/matcher/revision/epoch fields. Decide conflict behavior from verified old-writer semantics, not an optimistic `version` field that an old writer does not honor. Full-document compare-and-swap protects this writer's immediate operation but does not stop a later stale legacy replacement.
- Keep authentication, audience validation, ADMIN/USER authorization, validation and audit failure semantics intact. Exclude immutable policy publish/rollback endpoints from the legacy lane at the server, not merely in the UI. Expose explicit capability metadata so the UI does not imply unavailable behavior.
- New monitoring reads should use the existing event BSON contract (`timestamp` epoch milliseconds, `allowed`, `ruleSetId`, `userId`). Verify actual collection, transforms and event recording. No automatic event/audit index or TTL changes. Key lookup requires its audit record; disabling audit is not a shortcut.
- Keep branding/audit storage separate from legacy rule storage. Their writes still require an explicit retention and data ownership review; a nominally read-only dashboard is not globally read-only if these writes remain enabled.
- Emit a legacy-compatible reload only after successful rule mutation. The old parser can read `fullReload` and `ruleSetId` inside a v2 message, but it does not validate the new signature/nonce. Do not advertise a security upgrade to the old subscriber.
- Prefer targeted notifications where the legacy handler contract permits them, including multi-set imports. Verify null/default set behavior. Existing `@NotifyFullReload` can trigger a full Redis SCAN/reset in each subscribed 0.3.8 service; UI refresh must never trigger a reload.
- Preserve the Redis 0.3.8 bucket format. No KEYS command may be called. SCAN cost remains a legacy behavior and must be measured; this API lane alone does not solve shared Redis scaling.

## Required isolated proof before a compatibility claim

Use new, explicitly verified local Docker resources, random fixture databases, loopback ports and synthetic data only. Pin artifact hashes and use separate JVM classpaths for published legacy artifacts and the candidate server. Never point a harness at existing production Mongo/Redis or borrow production credentials.

| Scenario | Required observation | Current status |
| --- | --- | --- |
| Legacy unique id index; API startup | No DDL, no index migration, exact indexes retained | Not run for candidate lane |
| New UI/API authenticated rule CRUD/import | Correct result, validation, ADMIN denial for USER, audit behavior | Not run |
| New API write → old SDK read | All supported legacy fields and limits identical | Not run |
| Real HTTP → notification → old starter → Redis 0.3.8 | New limit observed, target reset scope, no KEYS, bounded latency reported | Not run |
| Multiple reader pods | Per-pod reload and Redis scan counts measured | Not run |
| Publication endpoint | Denied/unavailable for legacy mode; mutable state unchanged | Not run |
| Concurrent new and old writers | Stale conflict/lost update documented; no false CAS guarantee | Not run |
| Event producer → monitoring API → UI | Totals, time range, masking and key transform match | Not run |
| Rollback to old API/UI | Legacy documents/indexes usable, no new schema dependency | Not run |
| Reboot/interrupted deployment | Actual isolated service recovers, pending markers respected | Not run |

Existing Mongo compatibility harness results are NEGATIVE regressions: new scoped schema plus legacy writer can lose ACL fields or mis-target ID-only operations. Those tests do not prove this proposed lane.

## Deployment gate

Inventory actual AWS service versions, systemd paths, ports and API endpoints read-only. Current main deployment runs 43494645802 and 43494646207 failed connecting to SSH port 22 before copy/start; the cause still needs diagnosis. PR8 hard holds both main-push activations. Preserve that hold until the compatibility lane, operational recovery and exact production target are independently verified. No fallback to the old destructive workflow.
