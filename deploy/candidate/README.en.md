# Staging and recovering the Studio 0.5.0 API and UI

Validate both components at the same Studio commit. The new UI fails to load the dashboard against the previous API. The old UI submits rule edits without the version required by the candidate API. Independent production activation is disabled in both workflows. Both build jobs publish their artifacts before activation.

## Prepare a pair on the test server

A demo host can serve as the test server with separate directories and loopback ports. The visitor-facing demo has its own event API. Start both official processes in the isolated environment with separate synthetic data, login configuration and ports. Check the official repository, candidate commit and successful build job for each artifact. Set `SHA` to the reviewed 40-character commit and `API_RUN` and `UI_RUN` to the corresponding workflow run IDs.

```sh
set -eu
downloads=$(mktemp -d)
gh run download "$API_RUN" -R OpenFluxGate/fluxgate-studio -n "studio-api-$SHA" -D "$downloads/api"
gh run download "$UI_RUN" -R OpenFluxGate/fluxgate-studio -n "studio-ui-$SHA" -D "$downloads/ui"
python3 deploy/candidate/stage-bundles.py --commit "$SHA" --api-bundle "$downloads/api" \
  --ui-bundle "$downloads/ui" --destination "$downloads/verified"
```

The tool publishes `verified/SOURCE_COMMIT` after checking the file lists, SHA-256 hashes of the copied files, shared recovery code and the standalone UI archive. The payloads are `verified/api/api.jar` and `verified/ui/ui.tar.gz`. Use the independently verified SSH host key of the actual target for transfer. Set `ADMIN_API_URL` to the intended API at UI runtime. Exercise a signed-in browser request through the proxy since a working login page can hide an incorrect API URL.

## Install same-host systemd recovery

The API unit is `fluxgate-admin-api` and its existing on-disk filename is `fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar`. The UI unit is `fluxgate-studio` and runs `.next/standalone/server.js`. Check readability by the service users and write access for the deployment user. Set `SuccessExitStatus=143` on a Java unit that exits with 143 on graceful termination. The restore step requires `ActiveState=inactive` and `MainPID=0` after stopping the service.

Install from a reviewed checkout with the current services healthy.

```sh
sudo bash deploy/candidate/install-recovery.sh api /opt/fluxgate/admin-api "$DEPLOY_USER"
sudo bash deploy/candidate/install-recovery.sh ui /opt/fluxgate/studio "$DEPLOY_USER"
systemctl is-active fluxgate-recover-api.service fluxgate-recover-ui.service
```

Activation writes and syncs its journal before preserving and replacing the previous artifact. After a reboot, the recovery unit resolves the unfinished switch before starting the application. A separate confirmation verifies its PID and HTTP response. After a deployment process dies during the same boot, check that its transient unit has exited, inspect `.activation-pending`, then use `bash deploy/candidate/recover.sh api "$API_ROOT" manual` or its UI equivalent as the deploy user. A legacy journal or conflicting files requires inspection in the unit journal. Retain the previous release and transaction records for recovery.

Each component binds its own root-owned recovery helper version. Recovery verifies the full API JAR and the identity of the UI installation directory plus its standalone files, static assets and links. The comparison excludes the mutable `standalone/.next/cache`. Health checks require a stable PID, API HTTP 200 with JSON `status=UP`, and UI HTTP 200 on `/login`. The signed-in checks below verify routing and authorization.

## Production cutover

1. Capture the healthy installed pair with `pair-preflight.py capture --api JAR --ui NEXT_DIR`. Independently capture the known-good candidate build. Use `pair-preflight.py verify --help` to check the staged and retained copies against those pins. Verify users, ownership, health URLs and free space on the target.
2. Put both public routes and writes in maintenance and drain in-flight requests. Maintenance must survive a failed deployment process and a host reboot. The external router is managed by the operator.
3. Start the API first and check its health, role-based access and rules. Start the matching UI and verify actual login, Overview, administrator event access and viewer denial. Confirm the installed pair and service responses before restoring traffic.
4. On failure, keep maintenance active and restore the retained API and UI from the same release. Verify that version's login, dashboard and rule reads. The historical release restores its previous access controls and has no events screen.

## Audit retention

Supply a read-only `FLUXGATE_MONGO_URI`, explicit `FLUXGATE_MONGO_DB`, the configured `STUDIO_AUDIT_COLLECTION` and the agreed retention period. Use `STUDIO_AUDIT_EXPECTED_TTL_SECONDS=none` for indefinite retention or an integer in seconds.

```sh
mongosh --nodb --norc --quiet --file deploy/candidate/audit-retention.js
```

The check reads collection metadata and TTL indexes for both the audit and menu-policy audit collections. Exit 0 means both match, 1 means a missing collection or mismatched policy, and 2 means inspection failed. For existing installations, restore a backup to a separate database and compare documents and index definitions. For first-time installations, verify the collections after initialization with the intended settings. Restoring TTL-deleted data requires a database backup.
