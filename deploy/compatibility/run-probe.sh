#!/bin/sh
# Creates/destroys its own Mongo container. Never accepts a database URI or production data.
set -eu
HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
: "${JAVA_HOME:?Set JAVA_HOME to JDK 21}"
: "${FLUXGATE_M2_DIR:?Set FLUXGATE_M2_DIR to the isolated Maven repository containing the documented paired core 0.5.0 build}"
command -v docker >/dev/null
command -v curl >/dev/null
. "$HERE/local-docker.sh"
require_local_docker
WORK=$(mktemp -d "${TMPDIR:-/tmp}/studio-compat.XXXXXX")
CONTAINER=""
cleanup() {
  if [ -n "$CONTAINER" ]; then docker rm -fv "$CONTAINER" >/dev/null; fi
  printf 'Probe artifacts retained at %s\n' "$WORK"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir -p "$WORK/lib" "$WORK/classes-new" "$WORK/classes-old"
fetch() { curl --fail --silent --show-error --location "https://repo.maven.apache.org/maven2/$1" --output "$WORK/lib/$2"; }
for module in fluxgate-core fluxgate-mongo-adapter; do
  fetch "io/github/openfluxgate/$module/0.3.7/$module-0.3.7.jar" "$module-0.3.7.jar"
  cp "$FLUXGATE_M2_DIR/io/github/openfluxgate/$module/0.5.0/$module-0.5.0.jar" "$WORK/lib/"
done
for version in 5.2.1 5.5.2; do
  for module in mongodb-driver-sync mongodb-driver-core bson; do
    fetch "org/mongodb/$module/$version/$module-$version.jar" "$module-$version.jar"
  done
done
fetch "org/slf4j/slf4j-api/2.0.16/slf4j-api-2.0.16.jar" "slf4j-api-2.0.16.jar"
NEW="$WORK/lib/fluxgate-core-0.5.0.jar:$WORK/lib/fluxgate-mongo-adapter-0.5.0.jar:$WORK/lib/mongodb-driver-sync-5.5.2.jar:$WORK/lib/mongodb-driver-core-5.5.2.jar:$WORK/lib/bson-5.5.2.jar:$WORK/lib/slf4j-api-2.0.16.jar"
OLD="$WORK/lib/fluxgate-core-0.3.7.jar:$WORK/lib/fluxgate-mongo-adapter-0.3.7.jar:$WORK/lib/mongodb-driver-sync-5.2.1.jar:$WORK/lib/mongodb-driver-core-5.2.1.jar:$WORK/lib/bson-5.2.1.jar:$WORK/lib/slf4j-api-2.0.16.jar"
"$JAVA_HOME/bin/javac" -cp "$NEW" -d "$WORK/classes-new" "$HERE/CompatProbe.java"
"$JAVA_HOME/bin/javac" -cp "$OLD" -d "$WORK/classes-old" "$HERE/CompatProbe.java"
CONTAINER=$(docker run -d --label org.fluxgate.synthetic-compat=true -p 127.0.0.1::27017 mongo:7.0)
count=0
until docker exec "$CONTAINER" mongosh --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; do
  count=$((count+1)); [ "$count" -lt 60 ] || { echo 'Mongo readiness failed' >&2; exit 1; }; sleep 1
done
PORT=$(docker port "$CONTAINER" 27017/tcp | sed -n 's/^127\.0\.0\.1://p')
case "$PORT" in ''|*[!0-9]*) echo 'Unexpected non-loopback Mongo binding' >&2; exit 1;; esac
export COMPAT_MONGO_URI="mongodb://127.0.0.1:$PORT/?serverSelectionTimeoutMS=5000"
export COMPAT_DATABASE="compat_legacy_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
run() { "$JAVA_HOME/bin/java" -cp "$1" CompatProbe "$2"; }
# No pipe: Java/assertion failure must propagate. Save stdout/stderr to the retained log.
{
  run "$WORK/classes-new:$NEW" migrate
  run "$WORK/classes-new:$NEW" seed
  for mode in read write-acl write-duplicate delete; do run "$WORK/classes-old:$OLD" "$mode"; done
} > "$WORK/results.log" 2>&1
cat "$WORK/results.log"
