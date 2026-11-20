#!/usr/bin/env bash
set -Eeuo pipefail
component=${1:?api or ui required}
root=${2:?deployment directory required}
mode=${3:-manual}
[[ $component == api || $component == ui ]] || exit 2
source "$(dirname -- "$0")/recovery-common.sh"
# The post-start unit also runs during normal activation. It has work only if
# boot preparation restored and armed a transaction before the service started.
if [[ $mode == confirm ]]; then
  pending || exit 0
  # Normal service restarts can overlap the deployer's lock. Never wait on it.
  lock || exit $?
  pending || exit 0
  proof=$(journal armed)
  [[ $proof == armed ]] || exit 0
  target && health && journal finish
  exit $?
fi
lock
pending || exit 0
target
case $mode in
  prepare)
    # The application Requires/After this oneshot; do not start or stop it here.
    stopped || { echo 'Boot recovery requires an inactive application' >&2; exit 1; }
    journal restore
    journal arm
    ;;
  manual) restore ;;
  *) exit 2 ;;
esac
