#!/usr/bin/env bash
set -Eeuo pipefail
component=ui
root=${1:?deployment directory required}
staged=${2:?staged .next directory required}
source "$(dirname -- "$0")/recovery-common.sh"
lock
pending && { echo 'Unfinished activation requires recovery review' >&2; exit 2; }
[[ -w $root && -d $live && ! -L $live && -d $staged && ! -L $staged ]] || exit 2
[[ -s $staged/standalone/server.js && -s $staged/standalone/.next/BUILD_ID ]] || exit 2
[[ -d $staged/standalone/.next/static && -n $(find "$staged/standalone/.next/static" -type f -print -quit) ]] || exit 2
[[ -z $(find "$live/standalone" -maxdepth 1 -name '.env*' -print -quit) ]] || { echo 'Runtime environment file needs explicit migration review' >&2; exit 2; }
target
health || exit 2
backup=$(mktemp -d "$root/rollback.XXXXXXXX")
cp -a "$staged" "$backup/next"
activate
