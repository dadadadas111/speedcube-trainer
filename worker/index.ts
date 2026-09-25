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

    // HEAD is a GET without the body, so a route that answers one answers the
    // other. Checking only for GET made HEAD look like a missing route, which
    // is exactly the sort of thing that sends you debugging the wrong end.
    const reading = request.method === 'GET' || request.method === 'HEAD';

    if (pathname === '/sync/health' && reading) return health(request, env);
    if (pathname === '/sync/pull' && reading) return pull(request, env);
    if (pathname === '/sync/push' && request.method === 'POST') return push(request, env);

    // A wrong method on a real route should say so rather than quietly
    // handing back the app's HTML, which is what made the Pages version look
    // like it was working when it was not deployed at all.
    // /sync itself is an address the app is pointed at, not a page. Saying so
    // is kinder than serving the app's HTML, which reads as "the URL works"
    // to anyone who pastes it into a browser to check.
    if (pathname === '/sync' || pathname.startsWith('/sync/')) {
      return new Response(
        JSON.stringify({ error: 'This is the sync API, not a page. Put this address into Settings -> Sync.' }),
        { status: 404, headers: { 'content-type': 'application/json' } },
      );
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
