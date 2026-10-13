# Published policies and the local live proof

Studio manages mutable rule drafts and publishes authoritative policy generations through separate APIs. Editing a rule in the existing UI or `/api/rules` does not publish that draft. Publication requires one complete rules array and one complete ACL object in the same request; the server never assembles a generation by querying draft collections. The Envoy readers use the durable active-policy pointer on each request. A Redis reload notification is an optional hint after commit, and notification failure does not undo publication.

## Paired core artifacts

Studio uses the paired FluxGate core `MongoPolicyRepository` API and `0.5.0` artifacts.
The API is **not available in published 0.3.7 artifacts**. The reviewed source revision is
[`39a1789acfc481e416e7363dc6e9dd3817b147b5`](https://github.com/OpenFluxGate/openfluxgate-core/commit/39a1789acfc481e416e7363dc6e9dd3817b147b5).
Compose, Admin API CI, and the Admin API deployment workflow use this exact revision; update all
three when changing the pairing.
Envoy and Studio must use compatible policy schemas and repository implementations. The public pin
includes the reviewed policy and validation fixes. For later local development, select a matching
core worktree with `FLUXGATE_CORE_SOURCE`; publish and repin Compose, CI, deployment, and this guide together
before distributing another paired build.

This pair prepares 0.5.0 from source. Its Boot 3 server remains a legacy compatibility build;
the maintained server baseline and LTS support scope are pending. The paired core's
[security policy](https://github.com/OpenFluxGate/fluxgate/blob/39a1789acfc481e416e7363dc6e9dd3817b147b5/SECURITY.md#050-source-preparation)
records the residual Spring advisories. Native or Docker build success does not close that boundary.

Compose builds these dependencies in its own build container, without a host Maven cache.
`FLUXGATE_CORE_SOURCE=/absolute/path/to/core docker compose build admin-api` selects a matching local
checkout. A direct `docker build` also needs `--build-context fluxgate_core=/absolute/path/to/core`.

GitHub Actions installs the paired core artifacts into `$RUNNER_TEMP/fluxgate-m2` before building
the Admin API. The deployment workflow also runs `clean verify` on relevant pull requests; its
SSH and artifact-copy steps run only for pushes to `main`. Admin API and UI checks run on every
pull request to their configured target branches, including documentation-only changes, so required
checks are not left pending by path filters. Dependency Review blocks newly introduced high or
critical vulnerabilities; it does not certify the entire resolved dependency graph.

For native development, start in the Studio repository root with Java 21:

```bash
git clone https://github.com/OpenFluxGate/openfluxgate-core.git ../fluxgate-core-paired
git -C ../fluxgate-core-paired checkout 39a1789acfc481e416e7363dc6e9dd3817b147b5
export FLUXGATE_CORE_SOURCE="$(cd ../fluxgate-core-paired && pwd)"
```

If you already have a matching checkout, skip the clone and checkout commands above and select it:

```bash
export FLUXGATE_CORE_SOURCE=/absolute/path/to/matching/core
```

Then, in the same terminal from the Studio repository root, prepare and use an isolated repository:

```bash
export FLUXGATE_M2_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fluxgate-studio-m2.XXXXXX")"
(cd "$FLUXGATE_CORE_SOURCE" && ./mvnw -B -Dmaven.repo.local="$FLUXGATE_M2_DIR" \
  -pl fluxgate-spring-boot3-starter,fluxgate-control-support -am install spotless:check)
cd fluxgate-studio-admin-api
./mvnw -B -Dmaven.repo.local="$FLUXGATE_M2_DIR" clean verify spotless:check
```

Keep `FLUXGATE_M2_DIR` in the terminal for later Maven commands. The wrapper provides Maven; Docker
is needed for the integration-test tier. This builds `target/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`.
It does not publish SNAPSHOT artifacts; release distribution still requires a paired public release.

Studio obtains policy collections from the qualified `fluxgateMongoDatabase` bean supplied by
`FluxgateMongoClientHolder`. Its client is isolated from any application `MongoClient` bean and closed
at shutdown; an application-owned legacy `fluxgateMongoClient` remains under its owner's lifecycle.
Redis reload notifications require `FLUXGATE_CONTROL_SECRET`, matching Java SDK reader signing keys.
The local Compose fixture supplies a development-only key; production must supply a private value.

## Mutable draft identity

Draft rules use `(ruleSetId, id)` identity. Existing `/api/rules/{id}` paths accept a `ruleSetId` query parameter for read, update, delete, toggle and simulation. An ID-only request remains compatible when exactly one rule matches; multiple matches return 409 before any write. Blank creation/import sets, empty selectors and supplying both `ruleSetId` and `unassigned=true` return 400.

Mongo creation and import normalize an omitted or null `ruleSetId` to `default`, matching the shared FluxGate converter. Null and `default` therefore refer to the same creation/import identity and cannot bypass duplicate checks. `unassigned=true` explicitly selects a null pair for compatible non-Mongo backends; Mongo stores normalized sets and returns 404 for that selector. Generic SPI backends may support nullable sets but cannot guarantee duplicate global IDs, so Studio refuses unsupported collisions instead of overwriting another set.

Updates preserve the existing set when the body omits `ruleSetId`. An explicit different set returns 400: this editor never performs an implicit identity migration. Pair updates retain optimistic version checks, full-document CAS, and stored ACL/matcher/extension BSON. Successful create, update and toggle operations emit a conservative full-reload hint, including nullable SPI rules; failed writes do not emit a hint. Draft changes remain separate from immutable policy publication.

Studio reuses the core compound index contract and never creates a global unique ID constraint or drops an existing index at startup. A legacy global unique index requires the core's explicit maintenance migration before Studio can start.

## Publication API

Every endpoint requires a verified Bearer JWT with the configured issuer and audience. `USER` and `ADMIN` may read. Publication and rollback require `ADMIN` at both the URL authorization layer and the controller method layer.

These roles apply to the whole Studio deployment. They do not restrict an administrator to a tenant
or rule-set owner. Tenant-scoped quota keys do not provide tenant-scoped management permissions;
use separate deployments/databases and authorization boundaries when that isolation is required.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/api/rule-sets/{id}/active` | Read the complete active snapshot; 404 when absent. |
| GET | `/api/rule-sets/{id}/history?limit=20` | Read published history; limit must be 1–100. |
| POST | `/api/rule-sets/{id}/publish` | Publish one complete generation with a revision precondition. |
| POST | `/api/rule-sets/{id}/rollback` | Publish a historical generation as a new revision. |

Publication request envelope:

```json
{
  "expectedRevision": 11,
  "operationId": "7ca6930b-3345-4e93-95a7-374456450634",
  "rules": [
    {
      "id": "route-quota",
      "name": "Route quota",
      "enabled": true,
      "scope": "GLOBAL",
      "keyStrategyId": "global",
      "onLimitExceedPolicy": "REJECT_REQUEST",
      "ruleSetId": "default-limits",
      "priority": 20,
      "pathPatterns": ["/api/**"],
      "bands": [{"windowSeconds": 3600, "capacity": 3, "label": "hourly"}]
    }
  ],
  "accessControl": {},
  "resetCounters": false
}
```

The rules in this example illustrate the envelope; send the complete intended generation for the target rule set. For an ACL-only change, preserve the exact active rules and change only `accessControl`. Missing fields are rejected. `rules` must contain 1–500 non-null rules. `accessControl` is required, including `{}` for an empty ACL; its supported fields are `allowedIps`, `deniedIps`, `allowedKeys`, and `deniedKeys`, each containing a list of strings. IP entries must use the repository's validated literal IP/CIDR form. Keys represent engine policy keys; a raw caller header is not a verified identity.

`expectedRevision` is a nonnegative integer; use 0 only for the first publication. `operationId` is a UUID. Retrying the same request with the same operation ID and authenticated actor returns the already published generation; reuse for different content conflicts. `resetCounters` is an explicit boolean. Setting it to true also requires a nonblank `resetReason` of at most 500 characters. Structural changes that require a counter reset are validated by the shared repository. ACL-only changes preserve the counter epoch when reset is false.

The server assigns the revision and counter epoch, and derives `actor` from the verified authentication principal. Caller-supplied `actor`, `revision`, `counterEpoch`, or other unknown envelope fields are rejected. Rule validation also rejects reserved counter attributes.

Rollback uses the current active revision as its precondition:

```json
{
  "expectedRevision": 12,
  "targetRevision": 11,
  "operationId": "fc12039e-90bd-4d89-9bb9-302cc086daba",
  "resetCounters": false
}
```

`targetRevision` must be positive and belong to published history. Rollback creates a new revision; it never rewinds the active revision number. Counter-reset requirements still apply. Success returns the complete published snapshot. Validation errors return 400, revision or operation conflicts 409, missing active policy or rollback target 404, and unavailable or inconsistent storage 503. Responses omit submitted policy content and storage exception details.

## Real JWT and two-Pod proof

`verify-published-policy.py` runs against an already prepared isolated local fixture. It needs Python 3, OpenSSL, Java 21, the fresh Studio executable jar, a local MongoDB port forward, and two HTTPS forwards targeting **distinct actual authz Pods**. The coordinating harness must retain the Pod-to-port mapping; different URLs alone do not prove different Pods. Finish lifecycle and outage tests and recreate forwards after Pod restarts before running this proof. Do not run concurrent policy writers.

Required environment:

| Variable | Value |
| --- | --- |
| `FLUXGATE_MONGO_URI` | MongoDB URI through localhost, typically port 27039; same fixture database as Envoy. |
| `FLUXGATE_AUTHZ_URLS` | Two comma-separated URLs, e.g. `https://127.0.0.1:18443/authz/api/items,https://127.0.0.1:18444/authz/api/items`. |
| `FLUXGATE_TLS_DIR` | Private directory containing `server-ca.crt`, `client.crt`, and `client.key` from the isolated setup. |
| `FLUXGATE_PROOF_API_KEY` | The existing explicitly public local fixture key, supplied privately by the harness. |
| `JAVA_HOME` | Java 21 installation when `java` on PATH is not Java 21. |

The public fixture key belongs exclusively to the ephemeral development stack and must not become a production credential. The script does not hardcode it, print it, or include it in process arguments. Optional variables are `FLUXGATE_STUDIO_JAR`, `FLUXGATE_PROOF_EVIDENCE_DIR`, `FLUXGATE_RULE_SET_ID` (default `default-limits`), and `FLUXGATE_TLS_SERVER_NAME` (default `fluxgate-authz.fluxgate-enterprise.svc.cluster.local`).

After the harness exports the required environment:

```bash
python3 deploy/verify-published-policy.py
```

The script binds its own Studio instance to `127.0.0.1:8099` and an ephemeral JWKS server to `127.0.0.1:18199`; occupied ports fail the proof. It generates a temporary RSA signing key, serves its public JWK, and creates fresh RS256 JWTs with a two-minute expiry. Issuer, audience, signature, and role validation remain enabled. It deliberately excludes `ControlSupportAutoConfiguration`, so publication cannot depend on Redis Pub/Sub hints.

It checks anonymous, unsigned, and wrong-audience rejection; reader mutation denial; actor-spoof rejection; authenticated publication; immediate denial on both authz Pods after an ACL-only generation; unchanged counter epoch; operation replay; stale CAS rejection; invalid-ACL rejection without pointer mutation; and rollback to a new revision. A finally block republishes the initial ACL without resetting counters and verifies the existing fixture identity receives 200 or 429 from both Pods. It terminates only its own Java/JWKS processes and removes temporary signing material. This proof creates durable revisions and may consume quota; it does not reset the fixture's counter epoch.

Success writes optional `studio-policy-live.json` evidence and prints status/check results. No JWT, private key, raw authentication header, or transport exception details are printed. Failed validation or restoration exits nonzero and emits no new success evidence. These results prove the exercised local fixture, not a production deployment.
