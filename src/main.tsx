import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const fonts = document.createElement('link');
fonts.rel = 'stylesheet';
fonts.href =
  'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap&subset=vietnamese,latin';
document.head.appendChild(fonts);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
