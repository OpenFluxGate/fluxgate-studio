// Run with mongosh --nodb --norc --quiet --file deploy/candidate/audit-retention.js.
// Supply FLUXGATE_MONGO_URI via the environment. Set FLUXGATE_MONGO_DB and
// STUDIO_AUDIT_EXPECTED_TTL_SECONDS (none or an approved number of seconds).
// STUDIO_AUDIT_COLLECTION defaults to the Studio application default.
// Exit 0 = both observed policies match, 1 = mismatch/missing, 2 = inspection failed.
function inspectRetention() {
  const {FLUXGATE_MONGO_URI: uri, FLUXGATE_MONGO_DB: name,
    STUDIO_AUDIT_EXPECTED_TTL_SECONDS: expected} = process.env;
  const base = process.env.STUDIO_AUDIT_COLLECTION || 'studio_audit_log';
  if (!uri || !name || !(expected === 'none' ||
      (/^(0|[1-9][0-9]*)$/.test(expected) && Number(expected) <= 2147483647))) {
    throw new Error('invalid configuration');
  }
  const database = new Mongo(uri).getDB(name);
  const collections = [];
  for (const [role, collection] of [['audit', base], ['menuPolicyAudit', base + '_menu_policy']]) {
    const info = database.getCollectionInfos({name: collection})[0];
    if (!info) {
      collections.push({role, state: 'missing', matches: false});
      continue;
    }
    // Views, capped, timeseries, and collection-level expiry have different retention semantics.
    if (info.type !== 'collection' || info.options.capped || info.options.timeseries ||
        info.options.expireAfterSeconds !== undefined) {
      collections.push({role, state: 'unsupported-collection-policy', matches: false});
      continue;
    }
    const indexes = database.getCollection(collection).getIndexes();
    const ttl = indexes.filter(i => i.expireAfterSeconds !== undefined).map(i => ({
      fullAscendingAt: Object.keys(i.key).length === 1 && i.key.at === 1 && !i.partialFilterExpression,
      seconds: Number(i.expireAfterSeconds)
    }));
    const matches = expected === 'none' ? ttl.length === 0 :
      ttl.length === 1 && ttl[0].fullAscendingAt && ttl[0].seconds === Number(expected);
    collections.push({role, state: 'observed', indexCount: indexes.length, ttl, matches});
  }
  const matches = collections.every(c => c.matches);
  print(JSON.stringify({expected, collections, matches}));
  return matches ? 0 : 1;
}

let status;
try {
  status = inspectRetention();
} catch (_) {
  // Driver and server errors may contain credentials, collection names or document values.
  print(JSON.stringify({error: 'audit retention inspection failed'}));
  status = 2;
}
quit(status);
