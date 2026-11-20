#!/usr/bin/env bash
# Run on the host with a dedicated Lima instance (name "rehearsal") and the guest fixture installed.
set -euo pipefail
vm=${1:?isolated limactl wrapper}
out=${2:?new evidence directory}
mkdir -p "$out"
[[ -d $out && ! -e $out/scenarios.jsonl ]]
guest() { "$vm" shell rehearsal -- "$@"; }
[[ $(guest hostname -s) == lima-rehearsal ]]
guest sudo test -f /opt/fluxgate-vm/candidate/transaction.py
record() {
  guest sudo python3 /opt/fluxgate-vm/assert-state.py "$1" "$2" >>"$out/scenarios.jsonl"
}
boot_id() { guest cat /proc/sys/kernel/random/boot_id; }
for window in process-kill prepared between-renames switched healthy-uncommitted committed; do
  before=$(boot_id)
  record "$window-baseline" old
  for component in api ui; do
    guest sudo bash -s -- "$component" "$window" <<'GUEST'
set -euo pipefail
component=$1
window=$2
root=/srv/fluxgate-rehearsal/$component
unit=fluxgate-rehearsal-activate-$component
opts=()
if [[ $window != committed ]]; then
  cut=$window
  [[ $cut != process-kill ]] || cut=healthy-uncommitted
  opts+=(--setenv=PYTHONPATH=/opt/fluxgate-vm --setenv="FLUXGATE_CUT=$cut")
fi
if [[ $component == api ]]; then
  args=("$root/new.jar" "$(sha256sum "$root/new.jar" | cut -d' ' -f1)")
else
  args=("$root/stage")
fi
rm -f "/tmp/fluxgate-paused-$component"
systemd-run --collect --unit="$unit" --uid=fluxdeploy "${opts[@]}" -- /bin/bash \
    "/opt/fluxgate-vm/candidate/activate-$component.sh" "$root" "${args[@]}"
GUEST
  done
  if [[ $window == committed ]]; then
    for ((i=0; i<90; i++)); do
      if guest sudo python3 /opt/fluxgate-vm/assert-state.py pre-cut new >"$out/$window-pre.json" 2>/dev/null; then break; fi
      sleep 1
    done
    record "$window-pre-cut" new
    expected=new
  else
    guest bash -c 'for ((i=0; i<90; i++)); do if [[ -s /tmp/fluxgate-paused-api && -s /tmp/fluxgate-paused-ui ]]; then cat /tmp/fluxgate-paused-{api,ui}; exit 0; fi; sleep 1; done; exit 1' >"$out/$window-paused.txt"
    cut=$window
    [[ $cut != process-kill ]] || cut=healthy-uncommitted
    record "$window-pre-cut" "$cut"
    expected=old
  fi
  if [[ $window == process-kill ]]; then
    for component in api ui; do
      guest sudo systemctl kill --signal=SIGKILL "fluxgate-rehearsal-activate-$component"
      guest sudo -u fluxdeploy /bin/bash /opt/fluxgate-vm/candidate/recover.sh "$component" "/srv/fluxgate-rehearsal/$component"
    done
    [[ $(boot_id) == "$before" ]]
    record "$window-recovered" old
    guest sudo journalctl -b --no-pager -u 'fluxgate-*' >"$out/$window-journal.txt"
    printf 'PASS %s %s same boot, old restored\n' "$window" "$before"
    continue
  fi
  # No guest shutdown or filesystem sync. Only the private instance is stopped.
  "$vm" stop --force rehearsal >>"$out/power.log" 2>&1
  "$vm" start --yes rehearsal >>"$out/power.log" 2>&1
  after=$(boot_id)
  [[ $before != "$after" ]]
  # Confirmation may still be health-checking while SSH is already available.
  for ((i=0; i<90; i++)); do
    if guest sudo python3 /opt/fluxgate-vm/assert-state.py recovered "$expected" >/dev/null 2>&1; then break; fi
    sleep 1
  done
  record "$window-post-boot" "$expected"
  guest sudo journalctl -b --no-pager -u 'fluxgate-*' >"$out/$window-journal.txt"
  printf 'PASS %s %s -> %s %s\n' "$window" "$before" "$after" "$expected"
done
