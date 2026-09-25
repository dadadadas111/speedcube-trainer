/**
 * The sync store, moved off a VPS.
 *
 * This is sync.py with the same protocol and the same guarantees, running in a
 * Cloudflare Worker against D1. D1 is SQLite, so the schema came across
 * unchanged and so did the query shapes; what changed is that there is no
 * machine to keep alive, no nginx in front, and no CORS, because the Worker
 * serves the app and its API from one origin.
 *
 */

export interface Env {
  /** The built app. Anything that is not /sync is handed to this. */
  ASSETS: Fetcher;
  DB: D1Database;
  SYNC_USER: string;
  SYNC_PASSWORD: string;
}

/**
 * Tables the client may sync. Anything else is dropped rather than stored: an
 * open key-value store reachable with one password is a liability, and this
 * only ever needs these four.
 *
 * The order is not alphabetical, it is referential. A solve points at a
 * session and a rep points at an alg, so the referenced tables are written
 * first and a half-delivered push still makes sense to whoever pulls it.
 */
export const TABLE_ORDER = ['sessions', 'algs', 'solves', 'reps'] as const;
export const TABLES = new Set<string>(TABLE_ORDER);

export const MAX_RECORDS = 20_000;
/** D1 is happier with many small batches than one enormous one. */
export const CHUNK = 50;

export const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const sha256 = async (s: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

/**
 * Compare in constant time, so a wrong password cannot be found one character
 * at a time. Digests first: they are always 32 bytes, which removes the length
 * of the secret as something to measure.
 */
const sameSecret = async (a: string, b: string) => {
  const [x, y] = [await sha256(a), await sha256(b)];
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
};

/**
 * HTTP Basic, and unlike the Python version this also guards /health.
 *
 * There it was open, which handed anyone who found the URL the record count
 * and the revision. The client has always sent credentials on every call
 * including that one, so closing it costs nothing.
 */
export async function authorised(request: Request, env: Env): Promise<boolean> {
  if (!env.SYNC_USER || !env.SYNC_PASSWORD) return false;
  const header = request.headers.get('Authorization');
  if (!header?.startsWith('Basic ')) return false;
  let raw: string;
  try {
    raw = atob(header.slice(6));
  } catch {
    return false;
  }
  const at = raw.indexOf(':');
  if (at < 0) return false;
  const [user, password] = [raw.slice(0, at), raw.slice(at + 1)];
  const okUser = await sameSecret(user, env.SYNC_USER);
  const okPass = await sameSecret(password, env.SYNC_PASSWORD);
  return okUser && okPass;
}

export const deny = () =>
  new Response(JSON.stringify({ error: 'who are you' }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'WWW-Authenticate': 'Basic realm="cube-sync"',
    },
  });

export const currentRev = async (env: Env): Promise<number> => {
  const row = await env.DB.prepare("SELECT value FROM meta WHERE key='rev'").first<{ value: number }>();
  return Number(row?.value ?? 0);
};
