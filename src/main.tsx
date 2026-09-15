import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import OverlayPage from './pages/OverlayPage';
import ErrorBoundary from './components/ErrorBoundary';
import { normalizeCode } from './remote/protocol';
import './index.css';

/**
 * The cubing.js scramble worker shares this module graph, so the entry file can
 * be loaded in a worker context, where there is no `document`. Every DOM side
 * effect must therefore sit behind this check — otherwise the worker dies and
 * the app silently falls back to random-move scrambles.
 */
if (typeof document !== 'undefined') {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href =
    'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(fonts);

  /**
   * `?overlay=<code>` renders the OBS overlay instead of the app.
   *
   * A query parameter rather than a route because OBS wants one address to
   * paste, and because the app has no router — adding one to serve a single
   * page that is deliberately not part of the app would be the larger change.
   *
   * The page paints nothing behind itself and the body's background is dropped,
   * so OBS composites it over the camera. Keeping that here rather than in the
   * component means the app's own background is never touched.
   */
  const overlay = normalizeCode(new URLSearchParams(location.search).get('overlay') ?? '');
  const scale = Number(new URLSearchParams(location.search).get('scale')) || 22;
  const backdrop = new URLSearchParams(location.search).get('bg') !== '0';

  const root = document.getElementById('root');
  if (root) {
    if (overlay) {
      document.documentElement.style.background = 'transparent';
      document.body.style.background = 'transparent';
      createRoot(root).render(
        <StrictMode>
          <ErrorBoundary>
            <OverlayPage code={overlay} scale={scale} backdrop={backdrop} />
          </ErrorBoundary>
        </StrictMode>,
      );
    } else {
      createRoot(root).render(
        <StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </StrictMode>,
      );
    }
  }
}
