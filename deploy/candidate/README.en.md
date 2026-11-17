# Studio 0.5.0 deployment safety path

These activation scripts are wired into the API/UI workflows. **Production validation and activation approval remain pending.** Both repository variables `STUDIO_SAFE_DEPLOY_ENABLED` and `STUDIO_AUDIT_RETENTION_REVIEWED` must be true before uploading. Variables do not replace user approval.

Upload complete bundles with SHA256 manifests while the old service stays running. UI bundles include standalone static/public assets. Activate through a server-owned transient `systemd-run --wait` service using the deploying user's UID. Verify unit targets, old health and a server lock before stopping. The API's legacy 0.0.1-SNAPSHOT filename remains a compatibility deployment path containing verified 0.5.0 bytes. Preserve old artifacts/trees and restore on failed start, switch or health. UI refuses unexplained local runtime .env files. Backups are retained; a pending marker blocks later deployments after incomplete activation.

After SSH loss, inspect `fluxgate-deploy-{api|ui}-RUN_ID-RUN_ATTEMPT`, pending marker, backup and live state before retrying. Reboot/SIGKILL recovery is not automatic; markers prevent blind overwrite, not durable recovery. Never delete markers or restart without inspecting state. There is a short stop/switch/start outage; API/UI are not an atomic pair.

PR #8 retention opt-in fix 405c548 is preserved. Actual runtime opt-in, existing TTL indexes/data and retention policy still require review. Artifact rollback cannot restore TTL-deleted records. Production sudo/systemd-run/locking/permissions, disk space, SSH-disconnect behavior, runtime configuration, external access and authenticated functional checks are unverified.

Seventeen offline mocks pass: API6, UI8 (including TERM rollback), integrated workflow contracts3. No real service or DB was touched.
