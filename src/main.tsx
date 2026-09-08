import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

/**
 * Worker sinh scramble của cubing.js chạy chung đồ thị module với bundle này,
 * nên file entry có thể bị nạp trong ngữ cảnh worker — nơi không có `document`.
 * Vì vậy mọi tác dụng phụ đụng DOM phải nằm sau lớp kiểm tra này, nếu không
 * worker sẽ chết và app âm thầm rơi về scramble random-move.
 */
if (typeof document !== 'undefined') {
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href =
    'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap&subset=vietnamese,latin';
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
