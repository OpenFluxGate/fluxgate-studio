# Endpoint checks cannot detect a Unix socket forwarded to a remote engine.
# Require the operator to verify that this socket belongs to a disposable local Docker engine.
require_local_docker() {
  [ "${FLUXGATE_LOCAL_DOCKER_CONFIRMED:-}" = true ] || {
    echo "Verify the Docker engine is local (not a forwarded socket), then set FLUXGATE_LOCAL_DOCKER_CONFIRMED=true" >&2
    return 1
  }
  case "${DOCKER_HOST:-}" in
    '') ;;
    unix:///*) ;;
    *) echo 'Refusing non-local DOCKER_HOST' >&2; return 1 ;;
  esac
  # A selected context overrides DOCKER_HOST. Validate it even when a local host is set.
  context=$(docker context show) || return 1
  endpoint=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}') || return 1
  case "$endpoint" in
    unix:///*) ;;
    *) echo 'Refusing non-local Docker context endpoint' >&2; return 1 ;;
  esac
  # Pin the validated Unix endpoint so inherited context/host selection cannot change it.
  if [ -z "${DOCKER_CONTEXT:-}" ] && [ -n "${DOCKER_HOST:-}" ]; then
    endpoint=$DOCKER_HOST
  fi
  unset DOCKER_CONTEXT
  export DOCKER_HOST="$endpoint"
}
