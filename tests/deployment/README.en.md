# Phase 1 deployment safety

Run `python3 tests/deployment/test_workflows.py` with Python 3 and PyYAML 6.0.3.
The tests parse workflow contracts and execute inline shell scripts with mock
`sudo`, `curl`, `sleep`, and file-operation functions. They do not access SSH,
production, or real systemd. Passing them is not evidence of successful deployment.

The baseline is main commit 34b03a3c779680ec737c88d7d643e1e50efc107b.
Changes add preflight checks, same-checkout UI quality gates, bounded health checks,
and failure propagation. Each component has a separate concurrency group because
sharing one pending slot between UI/API workflows could cancel one component.
GitHub concurrency is not a FIFO queue; pending intermediate commits can be replaced.

## Explicit remaining limitations

- Existing stop-before-upload and UI `.next` deletion remain. This is NOT an atomic,
  zero-downtime, or rollback-capable deployment. Do not describe this PR as production-ready.
- Preflight deliberately requires existing writable deployment directories and loaded
  service units; it will fail closed on an unprovisioned server.
- The API/UI can deploy independently. Their cross-version compatibility is unverified.
- Current SSH reachability, credentials, host identity, service users, ExecStart,
  working directories, permissions, build layouts, and environment files are unverified.
- UI static-copy failures previously suppressed may now reveal an existing layout problem.
- HTTP health success alone does not establish database correctness or deployed SHA.
- A timeout or manual cancellation can still interrupt deployment; no rollback is wired.
- No UI dependency install/full build, real server check, actionlint, or shellcheck was
  executed for this patch. Full CI and actual server configuration inspection are required.

Phase 2 must first inspect systemd and artifact layout read-only, then design staged
uploads, preserved releases, switching, and rollback. Do not assume symlink paths or
roll back database/policy state automatically. No phase 2 scripts are connected here.
