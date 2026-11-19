#!/usr/bin/env bash
# Real Linux flock/chmod/sha256sum/cp/mv; systemd and HTTP are mocked.
set -euo pipefail
mkdir -p /tmp/bin
cat > /tmp/bin/sudo <<'MOCK'
#!/bin/bash
shift
exec "$@"
MOCK
cat > /tmp/bin/systemctl <<'MOCK'
#!/bin/bash
case "$1" in
show) case "$*" in
*LoadState*) echo loaded;;
*ActiveState*) echo inactive;;
*MainPID*) if [[ -f $ROOT/inactive ]]; then echo 0; else echo 100; fi;;
*WorkingDirectory*) echo "$ROOT/.next/standalone";;
*ExecStart*) echo "$TARGET";; esac;;
start) rm -f "$ROOT/inactive";;
stop) touch "$ROOT/inactive";;
esac
MOCK
cat > /tmp/bin/curl <<'MOCK'
#!/bin/bash
[[ $MODE != fail || $(cat "$LIVE") != new ]] || exit 22
while [[ $# -gt 0 ]]; do
  if [[ $1 == --output ]]; then output=$2; shift; fi
  shift
done
printf '{"status":"UP"}' > "$output"
printf 200
MOCK
printf '#!/bin/bash\nexit 0\n' > /tmp/bin/sleep
chmod +x /tmp/bin/*
export PATH=/tmp/bin:$PATH
for component in api ui; do
  for mode in success fail; do
    export ROOT=/tmp/$component-$mode MODE=$mode
    mkdir -p "$ROOT"
    if [[ $component == api ]]; then
      export LIVE="$ROOT/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar" TARGET="/usr/bin/java -jar $ROOT/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar"
      stage="$ROOT/stage.jar"; printf old > "$LIVE"; printf new > "$stage"
    else
      stage="$ROOT/stage"
      for tree in "$ROOT/.next" "$stage"; do
        mkdir -p "$tree/standalone/.next/static"
        printf build > "$tree/standalone/.next/BUILD_ID"
        printf asset > "$tree/standalone/.next/static/a.js"
      done
      export LIVE="$ROOT/.next/standalone/server.js" TARGET="/usr/bin/node $ROOT/.next/standalone/server.js"
      printf old > "$LIVE"; printf new > "$stage/standalone/server.js"
    fi
    hash=$(printf new | sha256sum | cut -d' ' -f1)
    rc=0
    bash "/src/deploy/candidate/activate-$component.sh" "$ROOT" "$stage" "$hash" || rc=$?
    if [[ $mode == success ]]; then test "$rc" = 0; test "$(cat "$LIVE")" = new; else test "$rc" != 0; test "$(cat "$LIVE")" = old; fi
    test ! -e "$ROOT/.activation-pending"
    echo "PASS real-Linux-filesystem $component $mode"
  done
done
