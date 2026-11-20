#!/usr/bin/env bash
set -Eeuo pipefail
component=api
root=${1:?deployment directory required}
staged=${2:?staged jar required}
expected=${3:?expected SHA256 required}
[[ $expected =~ ^[a-f0-9]{64}$ ]] || exit 2
source "$(dirname -- "$0")/recovery-common.sh"
lock
pending && { echo 'Unfinished activation requires recovery review' >&2; exit 2; }
[[ -w $root && -f $live && ! -L $live && -s $staged && ! -L $staged ]] || exit 2
[[ $(sha256sum "$staged" | cut -d' ' -f1) == "$expected" ]] || { echo 'Checksum mismatch' >&2; exit 2; }
target
health || exit 2
backup=$(mktemp -d "$root/rollback.XXXXXXXX")
cp "$staged" "$backup/next.jar"
chmod --reference="$live" "$backup/next.jar"
[[ $(sha256sum "$backup/next.jar" | cut -d' ' -f1) == "$expected" ]] || exit 2
activate
