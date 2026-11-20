// Fills the event collection with two hours of sample decisions for the monitoring console.
const now = Date.now();
const sets = [
  { ruleSetId: 'checkout-api', ruleId: 'checkout-api-per-user', perMinute: 40, rejectEvery: 9 },
  { ruleSetId: 'login-api', ruleId: 'login-api-per-ip', perMinute: 12, rejectEvery: 4 },
  { ruleSetId: 'search-api', ruleId: 'search-api-per-user', perMinute: 25, rejectEvery: 0 },
];
const users = ['100200300', '100200301', '100200302', '100200303', 'a3f9c1d2e4b5'];
const docs = [];
for (let minute = 120; minute >= 0; minute--) {
  for (const set of sets) {
    for (let i = 0; i < set.perMinute; i++) {
      const timestamp = now - minute * 60000 - Math.floor(Math.random() * 60000);
      const rejected = set.rejectEvery > 0 && i % set.rejectEvery === 0 && minute % 7 < 3;
      docs.push({
        timestamp: NumberLong(String(timestamp)),
        timestampIso: new Date(timestamp).toISOString(),
        createdAt: new Date(timestamp),
        allowed: !rejected,
        remainingTokens: NumberLong(String(rejected ? 0 : Math.floor(Math.random() * 10))),
        retryAfterMs: NumberLong(String(rejected ? 2000 + Math.floor(Math.random() * 8000) : 0)),
        ruleSetId: set.ruleSetId,
        ruleId: set.ruleId,
        ruleName: set.ruleId,
        endpoint: '/api/' + set.ruleSetId.replace('-api', ''),
        method: 'POST',
        userId: users[(i + minute) % users.length],
      });
    }
  }
}
db.rate_limit_events.insertMany(docs);
print('inserted ' + docs.length + ' decisions');
