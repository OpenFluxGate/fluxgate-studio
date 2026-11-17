# API activation candidate (not wired to production)

This reviewed-candidate script is intentionally not called by GitHub Actions. No remote upload, deployment or systemd change has been performed.

Build and verify 0.5.0 from the integrated PR SHA, including manifest/version and SHA256. Upload to a unique staging directory while the old service stays running. Invoke the candidate with deployment directory, staged JAR and runner-produced SHA256 only after further review.

The existing systemd target `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar` is a compatibility deployment filename, not the artifact version. The candidate preserves the unit and atomically renames verified bytes onto that path after backing up the previous artifact. It checks the expected unit target, existing health, active state, checksum and a server-side lock before stopping the service. Failed start/health restores the old artifact and verifies recovery, while still returning failure. Backups are retained.

Six offline mock cases passed: success, checksum mismatch, unexpected unit target, failed start, failed health and failed stop. Eleven prior workflow contract tests also passed. No SSH/systemd/DB was used. macOS tests mock flock and GNU chmod; real Ubuntu semantics and permissions remain unverified.

This is NOT production-ready: SIGKILL/reboot/SSH-disconnect recovery is not guaranteed; durable server-side execution/status needs further design. Artifact rollback does not undo schema/data changes. Old/new data compatibility must be verified. HTTP actuator success is not an authenticated functional smoke test. UI still needs staged standalone/static/public validation, directory switching and rollback instead of deleting the live build. Existing workflow edits are based on old main and must be integrated with latest PR #8 version alignment before publication or merge.

## Latest integration

Rebased onto PR #8 b0bcff1; workflow artifact validation now expects 0.5.0. Candidates remain disconnected from workflows. The UI candidate stages a complete .next tree, retains the previous directory, rolls back failed start/health/switch, and refuses local runtime .env files. Static assets/BUILD_ID are checked; public assets and package checksum still need validation. Seven additional UI mocks passed. Both candidates retain a pending marker after unhandled termination and refuse a later deployment until manual recovery review. This is fail-closed recovery detection, not durable execution or reboot recovery. Existing live stop/delete workflows remain unsafe for production activation.

## Integrated workflow and explicit production blocks

Local workflows now call these scripts and remove the old stop/delete-before-upload sequence. SHA256-verified bundles are staged first; UI includes static/public assets. Activation runs as a transient systemd system service with the deploying user's UID, independent of the SSH session. A disconnected client cannot know the outcome: inspect `fluxgate-deploy-{api|ui}-RUN_ID-RUN_ATTEMPT`, pending marker and backup before any retry. Reboot/SIGKILL recovery is not automatic.

Both `STUDIO_SAFE_DEPLOY_ENABLED=true` and `STUDIO_AUDIT_RETENTION_REVIEWED=true` repository variables are required before uploading. Neither has been set. Variables do not replace approval. Verify real sudo/systemd-run permissions, recovery and data compatibility first. PR #8's default 730-day studio_audit_log TTL can irreversibly remove existing data: resolve policy/code review before production. Artifact rollback cannot restore deleted database records.

The old eleven workflow-shape tests were replaced with three integrated workflow contracts; current count is API6/UI8/contracts3 = 17, including UI TERM rollback. Real SSH disconnection, systemd-run permissions and SIGKILL recovery remain unverified.
