import { CHUNK, MAX_RECORDS, TABLES, TABLE_ORDER, authorised, currentRev, deny, json, type Env } from './_lib';

interface Incoming {
  table?: unknown;
  uid?: unknown;
  updatedAt?: unknown;
  deleted?: unknown;
  data?: unknown;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
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
    // Referenced tables first: see TABLE_ORDER. A push large enough to be sent
    // in several batches can be pulled halfway through, and this is what stops
    // a solve arriving before the session it belongs to.
    .sort((a, b) => TABLE_ORDER.indexOf(a.tbl as never) - TABLE_ORDER.indexOf(b.tbl as never));

  if (!clean.length) return json(200, { rev: await currentRev(env), applied: 0 });

  // The revision moves ONCE for the whole push, not once per row, so a client
  // pulling at revision N gets a complete push or none of it. Every insert
  // below reads the revision back out of meta rather than being handed a
  // number, so the batches all land on the same one.
  await env.DB.prepare("UPDATE meta SET value = value + 1 WHERE key='rev'").run();
  const rev = await currentRev(env);

  // Strictly newer, expressed as part of the upsert: a re-push of something
  // already stored must not bump its revision, or every sync would hand it
  // back to everyone forever.
  const upsert = env.DB.prepare(
    `INSERT INTO records(tbl, uid, rev, updated_at, deleted, data)
     VALUES(?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(tbl, uid) DO UPDATE SET
       rev        = excluded.rev,
       updated_at = excluded.updated_at,
       deleted    = excluded.deleted,
       data       = excluded.data
     WHERE excluded.updated_at > records.updated_at`,
  );

  let applied = 0;
  for (let i = 0; i < clean.length; i += CHUNK) {
    const batch = clean
      .slice(i, i + CHUNK)
      .map((r) => upsert.bind(r.tbl, r.uid, rev, r.updated, r.deleted, r.data));
    const results = await env.DB.batch(batch);
    for (const r of results) applied += r.meta?.changes ?? 0;
  }

  return json(200, { rev, applied });
};
