# Published policies and the local live proof

Studio manages mutable rule drafts and publishes authoritative policy generations through separate APIs. Editing a rule in the existing UI or `/api/rules` does not publish that draft. Publication requires one complete rules array and one complete ACL object in the same request; the server never assembles a generation by querying draft collections. The Envoy readers use the durable active-policy pointer on each request. A Redis reload notification is an optional hint after commit, and notification failure does not undo publication.

## Paired core artifacts

This worktree uses the new `MongoPolicyRepository` API from the paired FluxGate core worktree. Although the current dependency coordinates still say `0.3.7`, this new API is **not available in the published 0.3.7 artifacts**. Install the matching core changes into an isolated Maven repository before building Studio. Do not substitute an older cached or public `0.3.7` jar. The deployment must pair the Studio API and Envoy reader with the same policy schema and repository implementation.

After the matching core installation completes, run from `fluxgate-studio-admin-api` with Java 21:

```bash
./mvnw -B -Dmaven.repo.local=/tmp/fluxgate-enterprise-m2/repository clean verify spotless:check
```

This builds `target/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`. The repository path is a local proof convention, not a production dependency source.

## Publication API

Every endpoint requires a verified Bearer JWT with the configured issuer and audience. `USER` and `ADMIN` may read. Publication and rollback require `ADMIN` at both the URL authorization layer and the controller method layer.

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
