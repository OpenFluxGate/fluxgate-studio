#!/usr/bin/env bash
# Run as root inside a disposable Linux container. All writes stay under /tmp.
set -euo pipefail
[[ $(id -u) == 0 ]]
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT
src=$(cd -- "$(dirname -- "$0")/../../deploy/candidate" && pwd)
mkdir -p "$fixture"/{src,src-update,legacy,bin,run,etc/systemd/system,usr/local,api,api-alternate,ui}
export FIXTURE="$fixture"
for checkout in src src-update; do
  cp "$src"/{recover.sh,recovery-common.sh,transaction.py,artifact_identity.py} "$fixture/$checkout/"
  sed -e "s# /run\$# $fixture/run#" -e "s#=/run/#=$fixture/run/#" \
      -e "s# /etc# $fixture/etc#g" -e "s#=/etc/#=$fixture/etc/#" \
      -e "s# /usr/local# $fixture/usr/local#g" -e "s#=/usr/local/#=$fixture/usr/local/#" \
      -e "s#immutable_dir /usr\$#immutable_dir $fixture/usr#" \
      "$src/install-recovery.sh" > "$fixture/$checkout/install-recovery.sh"
done
printf '# changed source\n' >> "$fixture/src-update/recovery-common.sh"
cat > "$fixture/bin/id" <<'MOCK'
#!/bin/bash
if [[ $* == '-u deployfixture' ]]; then echo 1234; else exec /usr/bin/id "$@"; fi
MOCK
cat > "$fixture/bin/sudo" <<'MOCK'
#!/bin/bash
shift 3
exec "$@"
MOCK
cat > "$fixture/bin/systemctl" <<'MOCK'
#!/bin/bash
if [[ $1 == daemon-reload && ${WAIT_FOR_INSTALL:-0} == 1 ]]; then
  touch "$FIXTURE/waiting"
  until [[ -f $FIXTURE/release ]]; do sleep 0.05; done
fi
MOCK
cat > "$fixture/bin/install" <<'MOCK'
#!/bin/bash
if [[ $* == *'/artifact_identity.py'* && ${FAIL_COPY:-0} == 1 ]]; then exit 1; fi
exec /usr/bin/install "$@"
MOCK
chmod +x "$fixture/bin/"*
export PATH="$fixture/bin:$PATH"
units="$fixture/etc/systemd/system"
helpers="$fixture/usr/local/libexec/fluxgate-deploy"
install_from() { bash "$fixture/$1/install-recovery.sh" "$2" "$fixture/$3" deployfixture; }

printf 'nonmatching legacy configuration\n' > "$units/fluxgate-recover-api.service"
if install_from src api api 2>"$fixture/legacy-error"; then exit 1; fi
grep -q 'Existing recovery configuration differs' "$fixture/legacy-error"
grep -qx 'nonmatching legacy configuration' "$units/fluxgate-recover-api.service"
test ! -e "$helpers"
rm "$units/fluxgate-recover-api.service"

WAIT_FOR_INSTALL=1 install_from src api api &
installer=$!
for attempt in {1..100}; do
  [[ ! -f $fixture/waiting ]] || break
  sleep 0.05
done
[[ -f $fixture/waiting ]]
status=0
install_from src api api-alternate 2>"$fixture/concurrent-error" || status=$?
touch "$fixture/release"
wait "$installer"
[[ $status == 2 ]]
grep -q 'Another recovery installation is in progress' "$fixture/concurrent-error"

install_from src ui ui
api_before=$(readlink "$helpers/api/current")
ui_before=$(readlink "$helpers/ui/current")
[[ $api_before == "$ui_before" ]]
grep -Fq "$helpers/api/current /bin/bash ./recover.sh api " "$units/fluxgate-recover-api.service"
grep -Fq "$helpers/ui/current /bin/bash ./recover.sh ui " "$units/fluxgate-recover-ui.service"
[[ $(stat -c %u "$helpers/api/$api_before/transaction.py") == 0 ]]

if FAIL_COPY=1 install_from src-update api api; then exit 1; fi
[[ $(readlink "$helpers/api/current") == "$api_before" ]]
cmp "$fixture/src/recovery-common.sh" "$helpers/api/current/recovery-common.sh"

install_from src-update api api
[[ $(readlink "$helpers/api/current") != "$api_before" ]]
[[ $(readlink "$helpers/ui/current") == "$ui_before" ]]
cmp "$fixture/src/recovery-common.sh" "$helpers/api/$api_before/recovery-common.sh"
cmp "$fixture/src-update/recovery-common.sh" "$helpers/api/current/recovery-common.sh"
cmp "$fixture/src/recovery-common.sh" "$helpers/ui/current/recovery-common.sh"

install_from src-update api api
if install_from src-update api api-alternate 2>"$fixture/rebind-error"; then exit 1; fi
grep -q 'Existing recovery configuration differs' "$fixture/rebind-error"
echo 'PASS isolated component helper bindings, interrupted copy, concurrent install and legacy rebind refusal'
