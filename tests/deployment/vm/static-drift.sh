#!/usr/bin/env bash
# Follow the six-scenario rehearsal. Only the previous UI static asset is changed.
set -euo pipefail
vm=${1:?isolated limactl wrapper}
out=${2:?new evidence directory}
mkdir -p "$out"
[[ ! -e $out/drift.log ]]
exec > >(tee "$out/drift.log") 2>&1
guest() { "$vm" shell rehearsal -- "$@"; }
[[ $(guest hostname -s) == lima-rehearsal ]]
boot_id() { guest cat /proc/sys/kernel/random/boot_id; }
cycle() {
  "$vm" stop --force rehearsal >>"$out/power.log" 2>&1
  "$vm" start --yes rehearsal >>"$out/power.log" 2>&1
}
guest sudo python3 /opt/fluxgate-vm/assert-state.py before-static-drift new >"$out/baseline.json"
first=$(boot_id)
guest sudo -u fluxdeploy bash -s <<'GUEST'
set -euo pipefail
root=/srv/fluxgate-rehearsal/ui
[[ ! -e $root/drift-candidate ]]
cp -a "$root/stage" "$root/drift-candidate"
echo old >"$root/drift-candidate/standalone/.next/BUILD_ID"
echo old >"$root/drift-candidate/standalone/.next/static/asset.js"
rm -f /tmp/fluxgate-paused-ui
GUEST
guest sudo systemd-run --unit=fluxgate-rehearsal-drift --collect --uid=fluxdeploy \
    --setenv=PYTHONPATH=/opt/fluxgate-vm --setenv=FLUXGATE_CUT=healthy-uncommitted \
    -- /bin/bash /opt/fluxgate-vm/candidate/activate-ui.sh \
    /srv/fluxgate-rehearsal/ui /srv/fluxgate-rehearsal/ui/drift-candidate
guest sudo -u fluxdeploy bash -s <<'GUEST'
set -euo pipefail
cd /srv/fluxgate-rehearsal/ui
for i in {1..90}; do [[ -s /tmp/fluxgate-paused-ui ]] && break; sleep 1; done
[[ -s /tmp/fluxgate-paused-ui && $(curl -fsS http://127.0.0.1:3000/fixture-identity) == old ]]
previous=$(python3 -c 'import json; print(json.load(open(".activation-pending"))["backup"])')/previous/standalone
for file in server.js .next/BUILD_ID .next/static/asset.js; do cmp "$previous/$file" "stage/standalone/$file"; done
sha256sum stage/standalone/server.js stage/standalone/.next/BUILD_ID stage/standalone/.next/static/asset.js
printf 'unreviewed bytes\n' >"$previous/.next/static/asset.js"
# Make injected corruption durable so power loss cannot erase the test input.
sync "$previous/.next/static/asset.js"
for file in server.js .next/BUILD_ID; do cmp "$previous/$file" "stage/standalone/$file"; done
if cmp -s "$previous/.next/static/asset.js" stage/standalone/.next/static/asset.js; then exit 1; fi
sha256sum "$previous/server.js" "$previous/.next/BUILD_ID" "$previous/.next/static/asset.js"
GUEST
cycle
second=$(boot_id)
[[ $first != "$second" ]]
guest sudo bash -s <<'GUEST'
set -euo pipefail
cd /srv/fluxgate-rehearsal/ui
systemctl is-failed --quiet fluxgate-recover-ui
[[ $(systemctl show fluxgate-studio --property=MainPID --value) == 0 ]]
[[ $(systemctl show fluxgate-studio --property=ActiveState --value) != active ]]
if curl -fsS --max-time 2 http://127.0.0.1:3000/fixture-identity; then exit 1; fi
[[ $(curl -fsS http://127.0.0.1:8081/fixture-identity) == new ]]
[[ -f .activation-pending ]]
previous=$(python3 -c 'import json; print(json.load(open(".activation-pending"))["backup"])')/previous/standalone
for file in server.js .next/BUILD_ID; do cmp "$previous/$file" "stage/standalone/$file"; done
[[ $(cat "$previous/.next/static/asset.js") == 'unreviewed bytes' ]]
systemctl show fluxgate-recover-ui fluxgate-studio --property=Id,ActiveState,Result,MainPID
sha256sum "$previous/server.js" "$previous/.next/BUILD_ID" "$previous/.next/static/asset.js"
# Operator corrects only the single known test modification from the verified fixture copy.
cp stage/standalone/.next/static/asset.js "$previous/.next/static/asset.js"
sync "$previous/.next/static/asset.js"
GUEST
guest sudo journalctl -b --no-pager -u fluxgate-recover-ui -u fluxgate-studio -u fluxgate-confirm-ui >"$out/refusal-journal.txt"
cycle
third=$(boot_id)
[[ $second != "$third" && $first != "$third" ]]
for i in {1..90}; do
  if guest sudo python3 /opt/fluxgate-vm/assert-state.py after-byte-repair new >"$out/recovered.json" 2>/dev/null; then break; fi
  sleep 1
done
guest sudo python3 /opt/fluxgate-vm/assert-state.py after-byte-repair new >"$out/recovered.json"
guest sudo journalctl -b --no-pager -u fluxgate-recover-ui -u fluxgate-studio -u fluxgate-confirm-ui >"$out/repaired-journal.txt"
printf 'PASS original backup static bytes changed alone; inconsistent rollback refused; fixed bytes restored on next boot. %s -> %s -> %s\n' "$first" "$second" "$third"
