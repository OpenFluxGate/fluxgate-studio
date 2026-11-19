#!/usr/bin/env bash
# Run from a trusted release checkout as root, while the verified app is active.
set -Eeuo pipefail
component=${1:?api or ui required}
root=${2:?canonical deployment directory required}
user=${3:?deployment user required}
case $component in
  api) app=fluxgate-admin-api.service ;;
  ui) app=fluxgate-studio.service ;;
  *) exit 2 ;;
esac
[[ $(id -u) == 0 && $(id -u "$user") != 0 && $user =~ ^[a-z_][a-z0-9_-]*$ ]] || exit 2
[[ $root =~ ^/[a-zA-Z0-9_/.-]+$ && $root == "$(realpath -e -- "$root")" && -d $root ]] || exit 2

immutable_dir() {
  local mode
  [[ -d $1 && $1 == "$(realpath -e -- "$1")" && $(stat -c %u -- "$1") == 0 ]] || return 2
  mode=$(stat -c %a -- "$1")
  (( (8#$mode & 8#022) == 0 ))
}
ensure_dir() {
  if [[ ! -e $1 && ! -L $1 ]]; then
    mkdir -m "$2" -- "$1" || [[ -d $1 ]]
  fi
  immutable_dir "$1"
}
immutable_file() {
  local mode
  [[ -f $1 && ! -L $1 && $(stat -c %u -- "$1") == 0 ]] || return 2
  mode=$(stat -c %a -- "$1")
  (( (8#$mode & 8#022) == 0 ))
}
die() { echo "$*" >&2; exit 2; }
immutable_dir /run
runtime=/run/fluxgate-deploy
ensure_dir "$runtime" 0700
[[ ! -L $runtime/install.lock ]] || exit 2
exec 8>"$runtime/install.lock"
flock -n 8 || die 'Another recovery installation is in progress'
sudo -n -u "$user" test -w "$root"
# Never adopt an interrupted legacy transaction or disrupt a live deployment.
[[ ! -L $root/.deploy.lock && ! -e $root/.activation-pending && ! -L $root/.activation-pending ]] || exit 2
systemctl is-active --quiet "$app"

src=$(cd -- "$(dirname -- "$0")" && pwd -P)
dest=/usr/local/libexec/fluxgate-deploy
etc=/etc/systemd/system
base=$dest/$component
helpers=(recover.sh recovery-common.sh transaction.py artifact_identity.py)
prepare=fluxgate-recover-$component.service
confirm=fluxgate-confirm-$component.service
work=$(mktemp -d)
stage=
locker_pid=
cleanup() {
  if [[ -n $locker_pid ]]; then
    exec 3>&-
    wait "$locker_pid" || true
  fi
  [[ -z $stage ]] || rm -rf -- "$stage"
  rm -rf -- "$work"
}
trap cleanup EXIT
cat > "$work/prepare" <<EOF
[Unit]
Description=Restore interrupted FluxGate $component activation before service startup
Before=$app
RequiresMountsFor=$root
[Service]
Type=oneshot
RemainAfterExit=yes
TimeoutStartSec=5min
User=$user
ExecStart=/usr/bin/env -C $base/current /bin/bash ./recover.sh $component $root prepare
EOF
cat > "$work/confirm" <<EOF
[Unit]
Description=Verify restored FluxGate $component service after boot
After=$prepare $app
[Service]
Type=oneshot
User=$user
ExecStart=/usr/bin/env -C $base/current /bin/bash ./recover.sh $component $root confirm
TimeoutStartSec=3min
[Install]
WantedBy=multi-user.target
EOF
cat > "$work/dropin" <<EOF
[Unit]
Requires=$prepare
After=$prepare
EOF
immutable_dir /etc
immutable_dir /etc/systemd
immutable_dir "$etc"
if [[ -e $etc/$app.d || -L $etc/$app.d ]]; then immutable_dir "$etc/$app.d"; fi
unit_files=("confirm:$etc/$confirm" "prepare:$etc/$prepare" "dropin:$etc/$app.d/50-fluxgate-recovery.conf")
# A different trusted checkout may update helpers, but must keep the same
# component, user and root. Legacy unversioned unit configurations require migration.
for pair in "${unit_files[@]}"; do
  target=${pair#*:}
  if [[ -e $target || -L $target ]]; then
    immutable_file "$target" && cmp -s "$work/${pair%%:*}" "$target" ||
      die "Existing recovery configuration differs at $target; inspect before replacing it"
  fi
done

# Only the unprivileged deployment account can open deploy-writable paths.
mkfifo "$work/ready" "$work/release"
exec 3<>"$work/release"
sudo -n -u "$user" bash -ec '
  [[ ! -L $1/.deploy.lock ]] || exit 2
  exec 9>>"$1/.deploy.lock"
  flock -n 9
  [[ ! -e $1/.activation-pending && ! -L $1/.activation-pending ]] || exit 2
  echo locked
  read -r release
' _ "$root" <"$work/release" >"$work/ready" 3>&- 8>&- &
locker_pid=$!
read -r status <"$work/ready"
[[ $status == locked ]]
systemctl is-active --quiet "$app"

immutable_dir /usr
immutable_dir /usr/local
ensure_dir /usr/local/libexec 0755
ensure_dir "$dest" 0755
ensure_dir "$base" 0755
helper_digest() (cd -- "$1" && sha256sum -- "${helpers[@]}" | sha256sum | cut -d ' ' -f1)
verify_version() {
  local version=$1 file
  immutable_dir "$base/$version" || return 2
  for file in "${helpers[@]}"; do immutable_file "$base/$version/$file" || return 2; done
  [[ $version == "v-$(helper_digest "$base/$version")" ]]
}
current=
if [[ -L $base/current ]]; then
  [[ $(stat -c %u -- "$base/current") == 0 ]] || exit 2
  current=$(readlink -- "$base/current")
  [[ $current =~ ^v-[0-9a-f]{64}$ ]] && verify_version "$current" || die 'Invalid current recovery helper set'
elif [[ -e $base/current ]]; then
  die 'Recovery helper pointer must be a relative symlink'
fi

# Build in a sibling temporary directory, verify before publication, and only
# then atomically move the component's pointer. Never overwrite a helper set.
stage=$(mktemp -d "$base/.install.XXXXXXXX")
for file in "${helpers[@]}"; do install -m 0644 -- "$src/$file" "$stage/$file"; done
chmod 0755 "$stage"
version=v-$(helper_digest "$stage")
if [[ ! -e $base/$version && ! -L $base/$version ]]; then
  sync -f "$stage"
  mv -T -- "$stage" "$base/$version"
  stage=
fi
verify_version "$version" || die 'Existing recovery helper set does not match its digest'
if [[ $current != "$version" ]]; then
  if [[ -z $stage ]]; then stage=$(mktemp -d "$base/.install.XXXXXXXX"); fi
  ln -s -- "$version" "$stage/current"
  mv -fT -- "$stage/current" "$base/current"
  sync -f "$base"
fi

ensure_dir "$etc/$app.d" 0755
for pair in "${unit_files[@]}"; do
  target=${pair#*:}
  if [[ ! -e $target ]]; then
    tmp=$(mktemp "${target}.XXXXXXXX")
    install -m 0644 -- "$work/${pair%%:*}" "$tmp"
    mv -T -- "$tmp" "$target"
  fi
done
sync -f "$etc"
systemctl daemon-reload
systemctl enable "$confirm"
echo release >&3
exec 3>&-
wait "$locker_pid"
locker_pid=
# Keep preparation active during subsequent service restarts on this boot.
systemctl start "$prepare"
systemctl is-active --quiet "$prepare"
