/**
 * The whole server side: static files, plus the sync store.
 *
 * Cloudflare has two shapes for this and they are not interchangeable. Pages
 * routes a `functions/` directory by filename; a Worker with static assets is
 * one script that decides for itself, and ignores `functions/` entirely. This
 * is the second, because that is what the project was deployed as.
 *
 * Anything that is not /sync falls through to ASSETS, which serves the built
 * app and its index.html fallback exactly as before.
 */
import { health, pull, push } from './sync';
import type { Env } from './lib';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === '/sync/health' && request.method === 'GET') return health(request, env);
    if (pathname === '/sync/pull' && request.method === 'GET') return pull(request, env);
    if (pathname === '/sync/push' && request.method === 'POST') return push(request, env);

    // A wrong method on a real route should say so rather than quietly
    // handing back the app's HTML, which is what made the Pages version look
    // like it was working when it was not deployed at all.
    if (pathname.startsWith('/sync')) {
      return new Response(JSON.stringify({ error: 'no such thing' }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
