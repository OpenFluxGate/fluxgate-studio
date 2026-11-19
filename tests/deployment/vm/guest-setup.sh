#!/usr/bin/env bash
# Only run on a dedicated disposable guest initialized by this rehearsal.
set -euo pipefail
[[ $(hostname -s) == lima-rehearsal && $(id -u) == 0 && $(cat /proc/1/comm) == systemd ]] || exit 2
src=$(cd "$(dirname "$0")" && pwd)
root=/srv/fluxgate-rehearsal
[[ ! -e $root ]] || exit 2
mkdir -p "$root"/{api,ui}
id fluxdeploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash fluxdeploy
printf 'fluxdeploy ALL=(root) NOPASSWD: /usr/bin/systemctl\n' >/etc/sudoers.d/fluxgate-fixture
chmod 0440 /etc/sudoers.d/fluxgate-fixture
for version in old new; do
    if [[ $version == old ]]; then stage=.next; else stage=stage; fi
    ui="$root/ui/$stage/standalone"
    mkdir -p "$ui/.next/static"
    cp "$src/server.js" "$ui/server.js"
    printf '%s\n' "$version" >"$ui/.next/BUILD_ID"
    printf '%s\n' "$version" >"$ui/.next/static/asset.js"
    cp "$src/$version.jar" "$root/api/$version.jar"
done
cp "$root/api/old.jar" "$root/api/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar"
chown -R fluxdeploy:fluxdeploy "$root"
cat >/etc/systemd/system/fluxgate-admin-api.service <<UNIT
[Unit]
Description=Disposable API artifact identity fixture
[Service]
User=fluxdeploy
SuccessExitStatus=143
ExecStart=/usr/bin/java -jar $root/api/fluxgate-studio-admin-api-0.0.1-SNAPSHOT.jar
[Install]
WantedBy=multi-user.target
UNIT
cat >/etc/systemd/system/fluxgate-studio.service <<UNIT
[Unit]
Description=Disposable UI build identity fixture
[Service]
User=fluxdeploy
WorkingDirectory=$root/ui/.next/standalone
ExecStart=/usr/bin/node $root/ui/.next/standalone/server.js
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now fluxgate-admin-api fluxgate-studio
