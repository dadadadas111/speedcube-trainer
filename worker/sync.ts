/**
 * The sync store: sync.py's protocol and guarantees, on D1.
 *
 * D1 is SQLite, so the schema came across untranslated and so did the query
 * shapes. What went away is the machine it used to need.
 */
import {
  CHUNK, MAX_RECORDS, TABLES, TABLE_ORDER,
  authorised, currentRev, deny, json, type Env,
} from './lib';

export async function health(request: Request, env: Env): Promise<Response> {
  if (!(await authorised(request, env))) return deny();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>();
  return json(200, { ok: true, records: Number(row?.n ?? 0), rev: await currentRev(env) });
}

export async function pull(request: Request, env: Env): Promise<Response> {
  if (!(await authorised(request, env))) return deny();

  const raw = new URL(request.url).searchParams.get('since') ?? '0';
  const since = Number(raw);
  if (!Number.isFinite(since) || since < 0) return json(400, { error: 'since must be a number' });

  const { results } = await env.DB
    .prepare('SELECT tbl, uid, rev, updated_at, deleted, data FROM records WHERE rev > ? ORDER BY rev LIMIT ?')
    .bind(since, MAX_RECORDS)
    .all<{ tbl: string; uid: string; rev: number; updated_at: number; deleted: number; data: string }>();

  const records = (results ?? []).map((r) => ({
    table: r.tbl, uid: r.uid, rev: r.rev,
    updatedAt: r.updated_at, deleted: r.deleted, data: JSON.parse(r.data),
  }));

  // The revision reported is the highest actually handed over, so a client cut
  // short asks again from where it got to instead of skipping.
  const rev = records.length ? records[records.length - 1].rev : since;
  return json(200, { rev, records, more: records.length >= MAX_RECORDS });
}

interface Incoming {
  table?: unknown; uid?: unknown; updatedAt?: unknown; deleted?: unknown; data?: unknown;
}

export async function push(request: Request, env: Env): Promise<Response> {
  if (!(await authorised(request, env))) return deny();

  let payload: { records?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json(400, { error: 'not json' });
  }
  const incoming = payload.records;
  if (!Array.isArray(incoming) || incoming.length > MAX_RECORDS) {
    return json(400, { error: 'records must be a list' });
  }

  const clean = (incoming as Incoming[])
    .filter((r) => typeof r.table === 'string' && TABLES.has(r.table) && typeof r.uid === 'string' && r.uid)
    .map((r) => ({
      tbl: r.table as string,
      uid: r.uid as string,
      updated: Number(r.updatedAt ?? 0) || 0,
      deleted: r.deleted ? 1 : 0,
      data: JSON.stringify(r.data ?? {}),
    }))
    // Referenced tables first (see TABLE_ORDER). A push big enough to need
    // several batches can be pulled while it is still landing, and this is
    // what stops a solve arriving before the session it points at.
    .sort((a, b) => TABLE_ORDER.indexOf(a.tbl as never) - TABLE_ORDER.indexOf(b.tbl as never));

  if (!clean.length) return json(200, { rev: await currentRev(env), applied: 0 });

  // The revision moves ONCE for the whole push, not once per row, so a client
  // pulling at revision N gets a complete push or none of it. Every insert
  // reads the revision back out of meta rather than being handed a number, so
  // the batches all land on the same one.
  await env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key='rev'").run();
  const rev = await currentRev(env);

  // Strictly newer, as part of the upsert: a re-push of something already
  // stored must not bump its revision, or every sync would hand it straight
  // back to everyone.
  const upsert = env.DB.prepare(
    `INSERT INTO records(tbl, uid, rev, updated_at, deleted, data)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(tbl, uid) DO UPDATE SET
       rev = excluded.rev, updated_at = excluded.updated_at,
       deleted = excluded.deleted, data = excluded.data
     WHERE excluded.updated_at > records.updated_at`,
  );

  let applied = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const batch = clean.slice(i, i + CHUNK)
      .map((r) => upsert.bind(r.tbl, r.uid, rev, r.updated, r.deleted, r.data));
    for (const res of await env.DB.batch(batch)) applied += res.meta?.changes ?? 0;
  }

  return json(200, { rev, applied });
}
