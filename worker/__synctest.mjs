/**
 * The sync store on D1, driven over real HTTP.
 *
 * Once, to give the local D1 its tables:
 *     npm run sync:schema
 * Then in another terminal:
 *     npm run sync:dev
 * and here:
 *     npm run test:sync
 *
 * It is safe to run repeatedly: every run invents its own uids and its own
 * clock, so it neither depends on an empty database nor leaves one behind.
 *
 * `wrangler.toml` ships with a placeholder database id, which the local
 * emulator will not accept. Put any UUID there while testing locally, or the
 * real one once `wrangler d1 create` has printed it.
 *
 * Everything here is a promise the client depends on: that a wrong password is
 * refused, that a re-push does not churn the revision, that a newer copy wins
 * and an older one loses, and that deleting keeps a tombstone rather than
 * removing a row.
 */
const BASE = process.env.SYNC_BASE ?? 'http://127.0.0.1:8790/sync';
const auth = (u = 'rogo', p = 'hunter2') => 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64');

let fails = 0;
const check = (name, ok, extra = '') => {
  if (ok) console.log('ok   ' + name);
  else { fails++; console.log('FAIL ' + name + (extra ? `  <${extra}>` : '')); }
};

const call = async (path, { body, user, pass, noAuth } = {}) => {
  const headers = {};
  if (!noAuth) headers.Authorization = auth(user, pass);
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not every refusal has a body */ }
  return { status: res.status, json };
};

// Every run gets its own uids and its own clock. A test that only passes
// against an empty database is a test you stop trusting the first time it
// fails for being run twice.
const RUN = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
const id = (name) => `${name}-${RUN}`;
const T = Date.now();
const rec = (table, uid, updatedAt, data = {}, deleted = 0) => ({ table, uid, updatedAt, deleted, data });

/* ---- Nothing without the password ---- */
check('no credentials is refused', (await call('/health', { noAuth: true })).status === 401);
check('a wrong password is refused', (await call('/health', { pass: 'wrong' })).status === 401);
check('a wrong user is refused', (await call('/health', { user: 'nope' })).status === 401);
check('the right ones get in', (await call('/health')).status === 200);

/* ---- Pushing, and the revision moving once per push ---- */
const start = (await call('/health')).json.rev;
const one = await call('/push', { body: { records: [
  rec('sessions', id('s'), T, { name: 'Main' }),
  rec('solves', id('v'), T + 1, { timeMs: 9870 }),
] } });
check('a push is accepted', one.status === 200 && one.json.applied === 2, JSON.stringify(one.json));
check('and moves the revision exactly once', one.json.rev === start + 1, `${start} -> ${one.json.rev}`);

/* ---- Pulling back what went in ---- */
const pulled = await call(`/pull?since=${start}`);
check('both records come back', pulled.json.records.length === 2, JSON.stringify(pulled.json.records?.length));
check('the session is there with its data',
  pulled.json.records.some((r) => r.uid === id('s') && r.data.name === 'Main'));
check('the referenced table is written first',
  pulled.json.records[0].table === 'sessions', pulled.json.records[0]?.table);

/* ---- A re-push must not churn ---- */
const again = await call('/push', { body: { records: [rec('sessions', id('s'), T, { name: 'Main' })] } });
check('re-pushing the same thing applies nothing', again.json.applied === 0, JSON.stringify(again.json));
check('an older copy loses',
  (await call('/push', { body: { records: [rec('sessions', id('s'), T - 500, { name: 'Stale' })] } })).json.applied === 0);
const newest = await call('/push', { body: { records: [rec('sessions', id('s'), T + 1000, { name: 'Renamed' })] } });
check('a newer copy wins', newest.json.applied === 1, JSON.stringify(newest.json));
check('and the new name is what comes back',
  (await call(`/pull?since=${start}`)).json.records.find((r) => r.uid === id('s')).data.name === 'Renamed');

/* ---- Only the four tables ---- */
const junk = await call('/push', { body: { records: [rec('secrets', id('x'), T + 2000, { a: 1 })] } });
check('an unknown table is refused', junk.json.applied === 0, JSON.stringify(junk.json));
check('and is not stored',
  (await call(`/pull?since=${start}`)).json.records.every((r) => r.table !== 'secrets'));

/* ---- Deleting keeps a tombstone ---- */
await call('/push', { body: { records: [rec('solves', id('v'), T + 3000, {}, 1)] } });
const stone = (await call(`/pull?since=${start}`)).json.records.find((r) => r.uid === id('v'));
check('a deleted record stays, marked', stone && stone.deleted === 1, JSON.stringify(stone));

/* ---- Rubbish in ---- */
check('a non-list of records is refused', (await call('/push', { body: { records: 'nope' } })).status === 400);
check('a bad since is refused', (await call('/pull?since=abc')).status === 400);
check('an empty push is harmless', (await call('/push', { body: { records: [] } })).json.applied === 0);

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
