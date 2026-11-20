#!/usr/bin/env bash
set -euo pipefail
PIN=39a1789acfc481e416e7363dc6e9dd3817b147b5
HERE=$(cd "$(dirname "$0")" && pwd)
. "$HERE/../local-docker.sh"
require_local_docker
WORK=$(mktemp -d "${TMPDIR:-/tmp}/fluxgate-redis-probe.XXXXXX")
NAME="fluxgate-redis-probe-$(date +%s)-$$"
TOKEN=$(python3 -c 'import uuid;print(uuid.uuid4())')
CREATED=false
cleanup() { if $CREATED; then docker rm -fv "$NAME" >/dev/null; fi; }
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
# Only a fresh container is allowed; do not reuse an existing URI or data volume.
docker run -d --name "$NAME" --label fluxgate.probe=disposable -p 127.0.0.1::6379 redis:7 redis-server --save '' --appendonly no >/dev/null
CREATED=true
PORT=$(docker port "$NAME" 6379/tcp)
[[ "$PORT" =~ ^127\.0\.0\.1:[0-9]+$ ]] || { echo 'Unexpected bind address'; exit 1; }
for i in $(seq 1 30); do docker exec "$NAME" redis-cli ping >/dev/null 2>&1 && break; sleep 1; done
docker exec "$NAME" redis-cli HSET dot:compat:fixture token "$TOKEN" >/dev/null
docker exec "$NAME" redis-server --version
docker inspect --format '{{.Image}}' "$NAME"
git clone --quiet https://github.com/OpenFluxGate/openfluxgate-core.git "$WORK/core"
git -C "$WORK/core" checkout --quiet --detach "$PIN"
cd "$WORK/core"
mkdir -p fluxgate-redis-ratelimiter/src/test/java/org/fluxgate/spring/reload/handler
cp fluxgate-spring-boot3-starter/src/main/java/org/fluxgate/spring/reload/handler/RedisBucketResetHandler.java fluxgate-redis-ratelimiter/src/test/java/org/fluxgate/spring/reload/handler/
cp "$HERE/RuleReapplyProbeTest.java" fluxgate-redis-ratelimiter/src/test/java/org/fluxgate/redis/
./mvnw -B -ntp -Dmaven.repo.local="$WORK/m2" -pl fluxgate-redis-ratelimiter -am \
 -Dfluxgate.probe.disposable=true -Dfluxgate.probe.uri="redis://$PORT" -Dfluxgate.probe.token="$TOKEN" \
 -Dtest=RuleReapplyProbeTest -Dsurefire.failIfNoSpecifiedTests=false -Dspotless.skip=true -Djacoco.skip=true test | tee "$WORK/result.log"
echo "Preserved test workspace and log: $WORK"
