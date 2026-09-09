import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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

  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  }
}
