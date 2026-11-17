#!/usr/bin/env bash
# Candidate only: deliberately NOT invoked by a deployment workflow yet.
set -Eeuo pipefail
root=${1:?deployment directory required}
staged=${2:?staged 0.5.0 jar required}
expected=${3:?expected SHA256 required}
[[ $expected =~ ^[a-f0-9]{64}$ ]] || exit 2
unit=fluxgate-admin-api
marker="$root/.activation-pending"
live="$root/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar"
[[ -d $root && -w $root && -f $live && ! -L $live && -s $staged && ! -L $staged ]] || exit 2
for cmd in flock sha256sum curl systemctl sudo mktemp cp mv; do command -v "$cmd" >/dev/null; done
exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Another deployment holds the lock' >&2; exit 3; }
[[ ! -e $marker ]] || { echo 'Unfinished activation requires manual recovery review' >&2; exit 2; }
[[ $(sha256sum "$staged" | cut -d' ' -f1) == "$expected" ]] || { echo 'Checksum mismatch' >&2; exit 2; }
[[ $(sudo -n systemctl show "$unit" --property=LoadState --value) == loaded ]] || exit 2
execstart=$(sudo -n systemctl show "$unit" --property=ExecStart --value)
[[ $execstart == *"/usr/bin/java -jar $live"* ]] || { echo 'Unexpected systemd target; refusing activation' >&2; exit 2; }
sudo -n systemctl is-active --quiet "$unit"
health() {
  local attempt
  for attempt in {1..12}; do
    if sudo -n systemctl is-active --quiet "$unit" && curl --fail --silent --show-error --connect-timeout 3 --max-time 5 http://localhost:8081/actuator/health >/dev/null; then return 0; fi
    sleep 5
  done
  return 1
}
health || { echo 'Existing service unhealthy; refusing activation' >&2; exit 2; }
# Keep rollback bytes before touching the running process. Same-filesystem rename.
backup=$(mktemp -d "$root/rollback.XXXXXXXX")
cp -p "$live" "$backup/previous.jar"
cp "$staged" "$backup/next.jar"
chmod --reference="$live" "$backup/next.jar"
[[ $(sha256sum "$backup/next.jar" | cut -d' ' -f1) == "$expected" ]] || exit 2
rollback() {
  trap - ERR INT TERM
  set +e
  echo 'Activation failed; restoring previous artifact' >&2
  if ! sudo -n systemctl stop "$unit"; then
    echo 'CRITICAL: rollback stop failed; artifact unchanged, manual recovery required' >&2
    exit 1
  fi
  if [[ $(sudo -n systemctl show "$unit" --property=ActiveState --value) != inactive ]] || [[ $(sudo -n systemctl show "$unit" --property=MainPID --value) != 0 ]]; then
    echo 'CRITICAL: rollback process still active; artifact unchanged, manual recovery required' >&2
    exit 1
  fi
  if ! cp -p "$backup/previous.jar" "$backup/restore.jar" || ! mv -f "$backup/restore.jar" "$live"; then
    echo 'CRITICAL: artifact restoration failed; manual recovery required' >&2
    exit 1
  fi
  if sudo -n systemctl start "$unit" && health; then
    rm -f "$marker"
    echo 'Previous artifact restored and healthy' >&2
  else
    echo 'CRITICAL: rollback health failed; manual recovery required' >&2
  fi
  exit 1
}
printf '%s\n' "$backup" > "$marker"
trap rollback ERR INT TERM
sudo -n systemctl stop "$unit"
[[ $(sudo -n systemctl show "$unit" --property=ActiveState --value) == inactive ]]
[[ $(sudo -n systemctl show "$unit" --property=MainPID --value) == 0 ]]
mv -f "$backup/next.jar" "$live"
sudo -n systemctl start "$unit"
health
trap - ERR INT TERM
rm -f "$marker"
echo "Activated verified artifact; retained rollback copy at $backup"
