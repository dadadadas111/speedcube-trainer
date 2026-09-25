import { authorised, currentRev, deny, json, type Env } from './_lib';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  if (!(await authorised(request, env))) return deny();
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM records').first<{ n: number }>();
  return json(200, { ok: true, records: Number(row?.n ?? 0), rev: await currentRev(env) });
};
