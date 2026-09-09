import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
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
