# Studio 0.5.0 upgrade and rollback boundaries

**Do not mix 0.3.7 writers with the 0.5.0 management schema. A successful build or a readable document does not establish write compatibility.** This guide is a checklist, not an automated migration or a backup/restore guarantee. No production data was inspected in the local verification below.

## Verified versions and scope

Synthetic-data tests on 2026-11-17 used MongoDB 7.0.26 and separate JVMs:

- Published Maven Central `io.github.openfluxgate:fluxgate-core:0.3.7` and `fluxgate-mongo-adapter:0.3.7`, Mongo driver 5.2.1. The published artifacts, not a Git tag with a different POM version, were used.
- Core source `39a1789acfc481e416e7363dc6e9dd3817b147b5`, version 0.5.0, Mongo driver 5.5.2, the Studio dependency pin at the time of this compatibility run. See [the build guide](README.md#paired-core-artifacts) for the current pin.
- Studio API and UI package version 0.5.0. The version alignment itself does not migrate documents or indexes.

These results do not cover every 0.3.x release, arbitrary production documents, or the actual deployed service configuration.

## Mixed-version failures reproduced

| Operation | Observed result | Consequence |
| --- | --- | --- |
| 0.5.0 startup index validation with legacy unique `id_1` | Refused; old index unchanged | Maintenance is required, not an automatic startup migration. |
| Explicit `migrateLegacyGlobalIdConstraint()` on synthetic data | Compound unique `(ruleSetId,id)` and nonunique `id` created | Different sets can then share an ID. |
| 0.3.7 reads a 0.5.0 rule | Basic rule loads; ACL fields ignored | Read success does not imply ACL enforcement compatibility. |
| 0.3.7 saves that rule | `deniedIps`, `deniedKeys`, `aclUpdatedAt` removed from actual Mongo document | Legacy writers can erase access-control data. |
| 0.3.7 saves with the same ID in multiple sets | ID-only selection can target the wrong document and fail with duplicate-key error 11000 | Pair identity is not preserved. |
| 0.3.7 `deleteById` on an ambiguous ID | One set deleted; the other remained | No ambiguity rejection; deletion can target the wrong set. |

Do not use a rolling upgrade that leaves legacy writers active against this shared collection. Stop or isolate old writers before enabling 0.5.0 writes; do not restart them merely because old readers can deserialize the rules. Network/account isolation must be planned and approved separately, not assumed by this guide.

## Before any real upgrade

1. Inventory actual binaries, writers/readers, Mongo database and collection names, indexes, duplicate IDs across rule sets, null/default set identities, ACL fields and active policy generations. Use read-only inventory first.
2. Identify the exact historical version to which rollback would return. Check compatibility against a synthetic or otherwise explicitly approved offline fixture; do not export production data without authorization.
3. Prepare a consistent backup of data **and indexes**, and prove restore into an isolated database. Record retention and recovery-point objectives. Neither this repository nor the tests provide a production backup.
4. Quiesce legacy writers and concurrent DDL for any approved identity migration. The explicit maintenance method is not run by Studio startup. Do not drop unknown indexes or silently remove constraints to make startup pass.
5. Validate API service `ExecStart`, artifact filename (`fluxgate-studio-admin-api-0.5.0.jar`), configured port, UI `ADMIN_API_URL`, JWT issuer/audience, Mongo and Redis targets. Docker's `/app/app.jar` is a separate packaging convention. Source default port 8090 is not evidence of the live server's port.
6. Exercise authentication, rule read/edit, audit, monitoring, reload behavior and policy publication in the isolated target before approving deployment.

## Rollback is more than restoring the JAR

A binary rollback cannot restore ACL fields already overwritten by a legacy writer, recover TTL-deleted records, or undo index migration. Once multiple sets share an ID, 0.3.7's ID-only operations are unsafe. New policy generations and counter changes also outlive the process.

Rollback must keep writers quiesced while a **verified, compatible** data/index state is restored or a separately reviewed forward repair is applied. Restoring an older snapshot loses later changes; reconcile those changes explicitly rather than claiming a lossless rollback. Policy rollback API publishes a new policy revision; it is not database or deployment rollback.

## Audit retention

`STUDIO_AUDIT_CREATE_INDEXES=false` is the safe default: no automatic audit index DDL. It does not remove or disable an existing TTL index. Only opt in after approval of collection, retention period and backup/restore procedure.

On isolated Mongo, an old synthetic record survived without TTL, was deleted after a 730-day TTL was created, and was also deleted under an unchanged existing 1-second TTL. Requesting 730-day options against that existing index raised `IndexOptionsConflict`. Changing an environment variable does not migrate existing index options. An application rollback cannot recover deleted records.

## Counters and edit normalization

With Redis 7.4.11 and paired core 39a1789, a capacity-3/one-hour bucket stayed exhausted after reconstructing the same rule. Calling the actual `RedisBucketResetHandler` for a targeted reload reset only the target; full reload reset the remaining bucket. Thus counter reset depends on the reload/reset-handler path, not simply reconstructing a rule. The Studio HTTP → signed Pub/Sub → SDK listener end-to-end path and live handler registration were not tested.

A service-level regression also reproduces an edit payload with `attributes={}` and `tags=[]` returning `attributes={"tags":[]}`. This is existing normalization, not a startup migration. It can produce audit differences; do not describe a save as a byte-for-byte no-op. The test does not simulate browser interaction.

## Reproduction and remaining limits

Run the focused Studio normalization regression with Java 21 and the paired core artifacts installed:

```bash
cd fluxgate-studio-admin-api
./mvnw -Dtest=RuleServiceTest#emptyTagsInEditPayloadAddsTagsToPreviouslyEmptyAttributes test
```

The Mongo compatibility harness in `deploy/compatibility/` uses synthetic local data only. Review its prerequisites and guards before running. The [Redis runner](compatibility/redis/README.md) reproduces the reset-handler checks using its own disposable Redis and a fresh pinned core checkout; it is not an operational Pub/Sub deployment.

Passing these checks does not establish production-data compatibility, successful full database restore, a safe rolling mixed-writer upgrade, or actual deployment readiness. Keep operational gates closed until the missing checks have been completed and approved.
