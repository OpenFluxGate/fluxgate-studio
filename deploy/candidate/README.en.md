# API activation candidate (not wired to production)

This reviewed-candidate script is intentionally not called by GitHub Actions. No remote upload, deployment or systemd change has been performed.

Build and verify 0.5.0 from the integrated PR SHA, including manifest/version and SHA256. Upload to a unique staging directory while the old service stays running. Invoke the candidate with deployment directory, staged JAR and runner-produced SHA256 only after further review.

The existing systemd target `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar` is a compatibility deployment filename, not the artifact version. The candidate preserves the unit and atomically renames verified bytes onto that path after backing up the previous artifact. It checks the expected unit target, existing health, active state, checksum and a server-side lock before stopping the service. Failed start/health restores the old artifact and verifies recovery, while still returning failure. Backups are retained.

Six offline mock cases passed: success, checksum mismatch, unexpected unit target, failed start, failed health and failed stop. Eleven prior workflow contract tests also passed. No SSH/systemd/DB was used. macOS tests mock flock and GNU chmod; real Ubuntu semantics and permissions remain unverified.

This is NOT production-ready: SIGKILL/reboot/SSH-disconnect recovery is not guaranteed; durable server-side execution/status needs further design. Artifact rollback does not undo schema/data changes. Old/new data compatibility must be verified. HTTP actuator success is not an authenticated functional smoke test. UI still needs staged standalone/static/public validation, directory switching and rollback instead of deleting the live build. Existing workflow edits are based on old main and must be integrated with latest PR #8 version alignment before publication or merge.
