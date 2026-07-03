import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './styles/global.css';
import './styles/responsive.css';
import App from './App.jsx';

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.VITE_ENV || 'development',
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,   // 10% of transactions — enough for visibility
    sendDefaultPii: false,
  });
}

// Register service worker (Phase 0 — sw.js is in public/)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);
