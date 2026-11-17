> Production activation is currently HARD-BLOCKED in both workflows, independent of repository variables. Removing that code hold requires operational review of reboot recovery and mixed API/UI version compatibility. The pending marker does NOT stop systemd from starting a service after reboot. Independent API/UI deployment can leave mixed versions; no compatibility claim is made. No production activation is permitted yet.

# Studio 0.5.0 deployment safety path

These activation scripts are wired into the API/UI workflows. **Production validation and activation approval remain pending.** Both repository variables `STUDIO_SAFE_DEPLOY_ENABLED` and `STUDIO_AUDIT_RETENTION_REVIEWED` must be true before uploading. Variables do not replace user approval.

Upload complete bundles with SHA256 manifests while the old service stays running. UI bundles include standalone static/public assets. Activate through a server-owned transient `systemd-run --wait` service using the deploying user's UID. Verify unit targets, old health and a server lock before stopping. The API's legacy 0.0.1-SNAPSHOT filename remains a compatibility deployment path containing verified 0.5.0 bytes. Preserve old artifacts/trees and restore on failed start, switch or health. UI refuses unexplained local runtime .env files. Backups are retained; a pending marker blocks later deployments after incomplete activation.

After SSH loss, inspect `fluxgate-deploy-{api|ui}-RUN_ID-RUN_ATTEMPT`, pending marker, backup and live state before retrying. Reboot/SIGKILL recovery is not automatic; markers prevent blind overwrite, not durable recovery. Never delete markers or restart without inspecting state. There is a short stop/switch/start outage; API/UI are not an atomic pair.

PR #8 retention opt-in fix 405c548 is preserved. Actual runtime opt-in, existing TTL indexes/data and retention policy still require review. Artifact rollback cannot restore TTL-deleted records. Production sudo/systemd-run/locking/permissions, disk space, SSH-disconnect behavior, runtime configuration, external access and authenticated functional checks are unverified.

Twenty-one offline mocks pass: API6, UI8 (including TERM rollback), integrated workflow contracts3. No real service or DB was touched.

## Additional review hardening

Every SCP/SSH action requires LIGHTSAIL_HOST_FINGERPRINT. The pre-upload gate rejects absent/malformed SHA256 fingerprints. Obtain and verify the server host fingerprint over an independent trusted channel before configuring it; do not infer or trust-on-first-use from the deployment connection. No fingerprint value has been registered. Checksums do not authenticate SSH hosts.

Rollback must successfully stop the service AND observe ActiveState=inactive/MainPID=0 before replacing any file. Failure preserves the pending marker and new artifact for manual recovery. Process-model tests distinguish running version/PID from on-disk bytes. Real service-user ownership/readability and sudo/systemd-run permissions remain deployment prerequisites, not mock-proven facts.
