# Disposable systemd power-cut rehearsal

Use a dedicated ARM64 Debian 12 Lima instance named `rehearsal` with independent writable storage, no host mounts, an isolated `LIMA_HOME`, Java 17, Node.js, curl, Python 3, sudo and systemd. The host runner force-stops this VM five times. Its Java and Node identity fixtures listen on the candidate scripts’ actual health ports and return the version loaded at process startup through a separate identity endpoint. Their on-disk SHA-256 digests are checked separately.

Run the following from the repository root with the guest running. Set `VM` to an absolute wrapper around `limactl` that selects this private `LIMA_HOME`. Set `OUT` to a new evidence directory. A JDK 11+ on the host builds the architecture-independent fixture JARs.

```bash
set -eu
fixtures=$(mktemp -d)
testdir=tests/deployment/vm
javac --release 11 -d "$fixtures" "$testdir/Identity.java"
for v in old new; do
  echo "$v" >"$fixtures/version"
  jar --create --file "$fixtures/$v.jar" --main-class Identity \
      -C "$fixtures" Identity.class -C "$fixtures" version
done
"$VM" shell rehearsal -- sudo mkdir -p /opt/fluxgate-vm/candidate
tar -C "$fixtures" -cf - old.jar new.jar | "$VM" shell rehearsal -- sudo tar -C /opt/fluxgate-vm -xf -
tar -C "$testdir" -cf - guest-setup.sh sitecustomize.py assert-state.py server.js | \
    "$VM" shell rehearsal -- sudo tar -C /opt/fluxgate-vm -xf -
tar -C deploy/candidate -cf - activate-api.sh activate-ui.sh recover.sh recovery-common.sh transaction.py artifact_identity.py install-recovery.sh | \
    "$VM" shell rehearsal -- sudo tar -C /opt/fluxgate-vm/candidate -xf -
"$VM" shell rehearsal -- sudo bash /opt/fluxgate-vm/guest-setup.sh
for component in api ui; do
  "$VM" shell rehearsal -- sudo bash /opt/fluxgate-vm/candidate/install-recovery.sh \
      "$component" "/srv/fluxgate-rehearsal/$component" fluxdeploy
done
bash "$testdir/exercise.sh" "$VM" "$OUT"
```

The test injects SIGSTOP only in the activation process's Python interpreter. It records the pre-cut journal, process and file layout, then kills the VM driver from the host. Recovery uses the installed production candidate scripts without test injection. A separate same-boot scenario kills both activation cgroups after the new services report healthy, then invokes manual recovery. Each interrupted scenario must return the old payload on both ports and restore its full fixture file content. Completed promotion must retain the new payloads across reboot. Each comparison requires a changed kernel boot ID.

The API unit declares `SuccessExitStatus=143` because OpenJDK can report SIGTERM as exit code 143. The candidate requires an inactive unit and zero MainPID after stop. The guest fixture grants its dedicated deployment user systemctl access only inside this isolated machine. Deployment-user authorization and actual artifact functional behavior on a target installation require separate verification.

After the main matrix, run `bash tests/deployment/vm/static-drift.sh "$VM" "$OUT/static-drift"` for the integrity refusal. This changes only one known rollback static asset while preserving server.js and BUILD_ID, powers off the private VM, and requires the UI service to stay stopped with its journal retained. The runner restores the exact reference byte content, then checks both services after a second boot.
