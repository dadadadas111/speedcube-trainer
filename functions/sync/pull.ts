import { MAX_RECORDS, authorised, deny, json, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await authorised(request, env))) return deny();

  const raw = new URL(request.url).searchParams.get('since') ?? '0';
  const since = Number(raw);
  if (!Number.isFinite(since) || since < 0) {
    return json(400, { error: 'since must be a number' });
  }

  const { results } = await env.DB
    .prepare(
      'SELECT tbl, uid, rev, updated_at, deleted, data FROM records WHERE rev > ? ORDER BY rev LIMIT ?',
    )
    .bind(since, MAX_RECORDS)
    .all<{ tbl: string; uid: string; rev: number; updated_at: number; deleted: number; data: string }>();

  const records = (results ?? []).map((r) => ({
    table: r.tbl,
    uid: r.uid,
    rev: r.rev,
    updatedAt: r.updated_at,
    deleted: r.deleted,
    data: JSON.parse(r.data),
  }));

  // The revision reported is the highest actually handed over, so a client that
  // was cut short asks again from where it got to instead of skipping.
  const rev = records.length ? records[records.length - 1].rev : since;
  return json(200, { rev, records, more: records.length >= MAX_RECORDS });
};
