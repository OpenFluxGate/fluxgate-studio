#!/usr/bin/env bash
# Candidate only. Stage a complete .next tree including standalone/.next/static.
set -Eeuo pipefail
root=${1:?deployment root required}
staged=${2:?prepared .next directory required}
unit=fluxgate-studio
live="$root/.next"
marker="$root/.activation-pending"
[[ -d $root && -w $root && -d $live && ! -L $live && -d $staged && ! -L $staged ]] || exit 2
for cmd in flock curl systemctl sudo mktemp cp mv; do command -v "$cmd" >/dev/null; done
exec 9>"$root/.deploy.lock"
flock -n 9 || exit 3
[[ ! -e $marker ]] || { echo 'Unfinished activation requires manual recovery review' >&2; exit 2; }
[[ -s $staged/standalone/server.js && -s $staged/standalone/.next/BUILD_ID ]] || exit 2
[[ -d $staged/standalone/.next/static ]] || exit 2
[[ -n $(find "$staged/standalone/.next/static" -type f -print -quit) ]] || exit 2
# Never silently discard deployment-local runtime environment files.
[[ -z $(find "$live/standalone" -maxdepth 1 -name '.env*' -print -quit) ]] || { echo 'Runtime environment file needs explicit migration review' >&2; exit 2; }
[[ $(sudo -n systemctl show "$unit" --property=LoadState --value) == loaded ]] || exit 2
[[ $(sudo -n systemctl show "$unit" --property=WorkingDirectory --value) == "$live/standalone" ]] || exit 2
execstart=$(sudo -n systemctl show "$unit" --property=ExecStart --value)
[[ $execstart == *"/usr/bin/node $live/standalone/server.js"* ]] || exit 2
health() {
  local attempt
  for attempt in {1..12}; do
    if sudo -n systemctl is-active --quiet "$unit" && curl --fail --silent --show-error --connect-timeout 3 --max-time 5 http://localhost:3000 >/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}
health || exit 2
backup=$(mktemp -d "$root/rollback.XXXXXXXX")
# This copy happens while the existing server is still serving.
cp -a "$staged" "$backup/next"
rollback() {
  trap - ERR INT TERM
  set +e
  if ! sudo -n systemctl stop "$unit"; then
    echo 'CRITICAL: rollback stop failed; artifact unchanged, manual recovery required' >&2
    exit 1
  fi
  if [[ $(sudo -n systemctl show "$unit" --property=ActiveState --value) != inactive ]] || [[ $(sudo -n systemctl show "$unit" --property=MainPID --value) != 0 ]]; then
    echo 'CRITICAL: rollback process still active; artifact unchanged, manual recovery required' >&2
    exit 1
  fi
  if [[ -d $backup/previous ]]; then
    if [[ -e $live ]] && ! mv "$live" "$backup/failed"; then echo 'CRITICAL: failed tree cannot be preserved' >&2; exit 1; fi
    if ! mv "$backup/previous" "$live"; then echo 'CRITICAL: restore failed' >&2; exit 1; fi
  fi
  if sudo -n systemctl start "$unit" && health; then
    rm -f "$marker"
    echo 'Previous UI restored and healthy' >&2
  else
    echo 'CRITICAL: UI rollback unhealthy; manual recovery required' >&2
  fi
  exit 1
}
printf '%s\n' "$backup" > "$marker"
trap rollback ERR INT TERM
sudo -n systemctl stop "$unit"
[[ $(sudo -n systemctl show "$unit" --property=ActiveState --value) == inactive ]]
[[ $(sudo -n systemctl show "$unit" --property=MainPID --value) == 0 ]]
mv "$live" "$backup/previous"
mv "$backup/next" "$live"
sudo -n systemctl start "$unit"
health
trap - ERR INT TERM
rm -f "$marker"
echo "UI activated; previous tree retained at $backup/previous"
