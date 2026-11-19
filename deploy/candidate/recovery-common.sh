# Shared by the activation and recovery entry points.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
root=$(cd -- "$root" && pwd -P)
marker="$root/.activation-pending"
if [[ $component == api ]]; then
  unit=fluxgate-admin-api
  live="$root/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar"
  url=http://127.0.0.1:8081/actuator/health
else
  unit=fluxgate-studio
  live="$root/.next"
  url=http://127.0.0.1:3000/login
fi
journal() { python3 "$script_dir/transaction.py" "$1" "$component" "$root" "${@:2}"; }
pending() { [[ -e $marker || -L $marker ]]; }
lock() {
  [[ ! -L $root/.deploy.lock ]] || return 2
  exec 9>>"$root/.deploy.lock"
  flock -n 9 || { echo 'Another deployment holds the lock' >&2; return 3; }
}
control() { sudo -n systemctl "$@"; }
property() { control show "$unit" --property="$1" --value; }
target() {
  [[ $(property LoadState) == loaded ]] || return 2
  local cmd expected
  cmd=$(property ExecStart) || return 2
  if [[ $component == api ]]; then
    expected="/usr/bin/java -jar $live"
  else
    [[ $(property WorkingDirectory) == "$live/standalone" ]] || return 2
    expected="/usr/bin/node $live/standalone/server.js"
  fi
  [[ $cmd == "$expected" || $cmd == *"argv[]=$expected ;"* ]] || {
    echo 'Unexpected systemd target; refusing activation' >&2; return 2;
  }
}
stopped() { [[ $(property ActiveState) == inactive && $(property MainPID) == 0 ]]; }
http_ready() (
  local status body=/dev/null
  local -a options=(--noproxy '*' --silent --show-error --connect-timeout 3 --max-time 5)
  if [[ $component == api ]]; then
    body=$(mktemp) || return 1
    trap 'rm -f -- "$body"' EXIT
    # Bound the file even on curl versions that only check known Content-Length.
    ulimit -f 64 || return 1
    options+=(--max-filesize 65536)
  fi
  status=$(curl "${options[@]}" --output "$body" --write-out '%{http_code}' "$url") || return 1
  [[ $status == 200 ]] || return 1
  if [[ $component == api ]]; then
    python3 -c 'import json, sys
with open(sys.argv[1], "rb") as stream:
    body = stream.read(65537)
    if len(body) > 65536:
        sys.exit(1)
try:
    payload = json.loads(body)
except (ValueError, RecursionError):
    sys.exit(1)
sys.exit(0 if isinstance(payload, dict) and payload.get("status") == "UP" else 1)
' "$body"
  fi
)
health() {
  local attempt pid
  for attempt in {1..12}; do
    pid=$(property MainPID) || return 1
    if [[ $pid =~ ^[1-9][0-9]*$ ]] && control is-active --quiet "$unit" &&
       http_ready && control is-active --quiet "$unit" &&
       [[ $(property MainPID) == "$pid" ]]; then return 0; fi
    sleep 5
  done
  return 1
}
restore() {
  journal inspect || return 1
  control stop "$unit" || { echo 'CRITICAL: rollback stop failed' >&2; return 1; }
  stopped || { echo 'CRITICAL: rollback process still active' >&2; return 1; }
  journal restore || return 1
  control start "$unit" && health && journal finish || return 1
  echo 'Previous artifact restored and healthy' >&2
}
rollback() {
  trap - ERR INT TERM
  restore || echo 'CRITICAL: rollback incomplete; journal retained for recovery review' >&2
  exit 1
}
activate() {
  journal begin "${backup##*/}"
  trap rollback ERR INT TERM
  control stop "$unit"
  stopped
  journal switch
  control start "$unit"
  health
  journal commit
  trap - ERR INT TERM
  echo "Activated verified release; previous artifact retained at $backup"
}
