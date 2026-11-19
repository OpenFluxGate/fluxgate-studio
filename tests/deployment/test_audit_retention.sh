#!/usr/bin/env bash
# Exercise Studio's audit catalog exclusively in a disposable MongoDB with no published ports.
set -euo pipefail
root=$(cd "$(dirname "$0")/../.." && pwd)
container=$(docker run -d --rm --network none -e MONGO_INITDB_ROOT_USERNAME=fixture_admin \
  -e MONGO_INITDB_ROOT_PASSWORD=fixture_only mongo:7)
trap 'docker rm -f "$container" >/dev/null' EXIT
admin() {
  docker exec "$container" mongosh --norc --quiet --username fixture_admin \
    --password fixture_only --authenticationDatabase admin --eval "$1"
}
for ((i=0; i<60; i++)); do
  # Wait for the final mongod, after the image's temporary init server exits.
  if docker exec "$container" sh -c 'test "$(cat /proc/1/comm)" = mongod' &&
      admin 'db.adminCommand({ping:1})' >/dev/null 2>&1; then break; fi
  sleep 1
done
admin 'print(JSON.stringify({server:db.version()}))'
admin 'db.getSiblingDB("admin").createUser({user:"fixture_reader",pwd:"reader_fixture_only",
  roles:["source","restored"].map(db => ({role:"read",db}))})' >/dev/null
docker cp "$root/deploy/candidate/audit-retention.js" "$container:/tmp/audit-retention.js"
check() {
  local scenario=$1 database=$2 expected=$3 code=$4 actual=0 result
  result=$(docker exec -e FLUXGATE_MONGO_URI=mongodb://fixture_reader:reader_fixture_only@127.0.0.1/admin \
    -e FLUXGATE_MONGO_DB="$database" -e STUDIO_AUDIT_EXPECTED_TTL_SECONDS="$expected" \
    "$container" mongosh --nodb --norc --quiet --file /tmp/audit-retention.js 2>&1) || actual=$?
  if [[ "$actual" != "$code" || "$result" == *fixture_only* || "$result" == *fixture-event* ]]; then
    echo "$scenario failed exit or redaction check" >&2; return 1
  fi
  python3 -c 'import json,sys; print(json.dumps({"scenario":sys.argv[1],"exit":int(sys.argv[2]),"result":json.loads(sys.stdin.read())}))' "$scenario" "$actual" <<< "$result"
}
collections='["studio_audit_log","studio_audit_log_menu_policy"]'
check fresh source none 1
admin "const s=db.getSiblingDB('source'); $collections.forEach((n,i)=>{
  const c=s.getCollection(n);
  c.insertOne({_id:new ObjectId(),at:new Date(),action:i?'MENU_POLICY_UPDATE':'RULE_CREATE',
    actor:{username:'fixture-event'},target:{},before:null,after:{},detail:{}});
  c.createIndex({at:1});c.createIndex({at:-1,_id:-1});c.createIndex({action:1,at:-1});
})" >/dev/null
check retained source none 0
admin "const s=db.getSiblingDB('source'); s.runCommand({collMod:'studio_audit_log_menu_policy',
  index:{keyPattern:{at:1},expireAfterSeconds:63072000}})" >/dev/null
check unexpectedMenuExpiry source none 1
admin "db.getSiblingDB('source').runCommand({collMod:'studio_audit_log',
  index:{keyPattern:{at:1},expireAfterSeconds:63072000}})" >/dev/null
check configuredExpiry source 63072000 0
docker exec "$container" mongodump --quiet --username fixture_admin --password fixture_only \
  --authenticationDatabase admin --db source --archive=/tmp/fixture.archive
docker exec "$container" mongorestore --quiet --username fixture_admin --password fixture_only \
  --authenticationDatabase admin --nsInclude 'source.*' --nsFrom 'source.*' --nsTo 'restored.*' \
  --archive=/tmp/fixture.archive
check restoredExpiry restored 63072000 0
admin "const equal=(a,b)=>{if(EJSON.stringify(a)!==EJSON.stringify(b))throw Error('fixture restore mismatch')};
  const source=db.getSiblingDB('source'), restored=db.getSiblingDB('restored');
  equal(restored.getCollectionNames().sort(),$collections);
  for(const n of $collections) {
    const a=source.getCollection(n), b=restored.getCollection(n);
    equal(a.countDocuments({}),1);equal(a.countDocuments({}),b.countDocuments({}));
    equal(EJSON.stringify(a.find().toArray()),EJSON.stringify(b.find().toArray()));
    const indexes=c=>c.getIndexes().sort((x,y)=>x.name.localeCompare(y.name));
    equal(indexes(a),indexes(b));
  }
  print(JSON.stringify({scenario:'archiveRoundTrip',collections:2,documents:2,
    indexesPerCollection:4,documentsAndIndexesEqual:true}))"
admin "db.getSiblingDB('restored').studio_audit_log.createIndex({other:1},{expireAfterSeconds:123456})" >/dev/null
check unexpectedExtraExpiry restored 63072000 1
check invalidExpectation source invalid 2
