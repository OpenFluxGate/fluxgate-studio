# Synthetic 0.3.7 / 0.5.0 Mongo compatibility probe

This is a **negative compatibility regression**, not a migration tool. A successful run reproduces why mixed-version writers and an application-only rollback are unsafe.

Prerequisites: Docker, curl, JDK 21 (`JAVA_HOME`), and the isolated Maven repository (`FLUXGATE_M2_DIR`) produced by the paired core build documented in `deploy/README.md`. The 0.5.0 artifacts used in the original proof came from core commit `39a1789acfc481e416e7363dc6e9dd3817b147b5`. Verify the same pairing before interpreting a rerun. Do not substitute unrelated local 0.5.0 artifacts.

```sh
FLUXGATE_LOCAL_DOCKER_CONFIRMED=true JAVA_HOME=/path/to/jdk21 FLUXGATE_M2_DIR=/path/to/isolated-m2 \
  sh deploy/compatibility/run-probe.sh
```

The runner downloads public 0.3.7 artifacts from Maven Central. It uses the 0.3.7 module's Mongo driver 5.2.1 and the paired Studio lane's driver 5.5.2 in separate JVMs. It creates a new `mongo:7.0` container, binds only a randomly allocated localhost port, selects a random synthetic database, and removes its own container and anonymous volumes on exit. No production URI, host directory mount, or database dump is accepted. Temporary JARs/classes/results are retained in the printed temporary directory. Neither the runner nor Java probe is a production migration command.

Assertions:
- 0.5.0 refuses a legacy unique `id_1` index without deleting it.
- Explicit migration establishes compound uniqueness and permits the same ID in different rule sets.
- 0.3.7 can read basic 0.5.0 rule BSON with extra ACL fields, but has no corresponding AccessControl model.
- A legacy save strips the newer ACL fields/marker from MongoDB.
- A legacy ID-only save on ambiguous IDs hits a compound duplicate-key error.
- A legacy ID-only delete removes one rule set without rejecting ambiguity.

The successful `PASS REPRODUCED` results for the last three cases confirm hazardous behavior, not safe compatibility. Stop old writers before migration; do not roll old writers back onto a newly scoped dataset. Real data shapes, live quota behavior, database restore, every 0.3.x release, and the HTTP deployment lifecycle are outside this harness. No production data was used in the original run.

Both the selected Docker context and any DOCKER_HOST override must resolve to local Unix socket endpoints. SSH/TCP endpoints are refused before creating a fixture, and the validated endpoint is pinned for the run. Signal handlers exit immediately; the EXIT trap removes only the runner-owned container and anonymous volumes.

**Operator check required:** before setting `FLUXGATE_LOCAL_DOCKER_CONFIRMED=true`, inspect your Docker setup and verify the Unix socket connects to the intended local machine, not an SSH/proxy/socket-forwarded remote daemon. Endpoint syntax checks cannot establish where the daemon physically runs. The acknowledgement is a prerequisite, not an automated proof of locality. If this cannot be verified, do not run the probe.
