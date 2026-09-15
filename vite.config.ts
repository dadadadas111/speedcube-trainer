import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /**
     * In production the app and the sync store are the same origin, because
     * nginx puts the store at /sync on the site's own address. Development
     * serves the app from localhost, so without this the browser would refuse
     * the request and the difference would only show up on a real deployment.
     *
     * Point SYNC_ORIGIN at your own server to develop against it.
     */
    proxy: {
      '/sync': {
        target: process.env.SYNC_ORIGIN ?? 'https://cube.dash.id.vn',
        changeOrigin: true,
        secure: true,
      },
      // The phone bridge and the stream overlay both ride this. Proxied for the
      // same reason as /sync: in production it is the app's own origin, and
      // without this development is the only place it does not work.
      '/relay': {
        target: process.env.RELAY_ORIGIN ?? 'wss://cube.dash.id.vn',
        ws: true,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    /**
     * Both options below exist for the same reason, and only a production build
     * shows the problem — the dev server always works.
     *
     * cubing.js generates random-state scrambles in a Web Worker. That worker
     * shares the module graph with the app, so its chunk imports the entry chunk
     * and calls Vite's `__vitePreload` helper as soon as it loads. The helper
     * touches `document` to insert preload <link> tags — and a worker has no
     * `document`, so the worker dies. The consequence is quiet: the app keeps
     * working but silently drops from WCA random-state scrambles to random-move.
     *
     * - modulePreload: false  -> drops the module preload link insertion.
     * - cssCodeSplit: false   -> bundles CSS into one file loaded from the HTML,
     *                            so a dynamic import no longer carries a list of
     *                            CSS to preload. With an empty list
     *                            `__vitePreload` returns early and never touches
     *                            `document`.
     *
     * See also the guard in src/main.tsx (blocking the entry's DOM side effects)
     * and the scramble-source badge in the UI, so this cannot come back quietly.
     */
    modulePreload: false,
    cssCodeSplit: false,
  },
});
