/* REACH Election — Service Worker
   Phase 7 hardened version. Verbatim from 08_SECURITY.md service worker rules.

   Rules:
   - SHELL_URLS cached on install: '/', '/index.html', '/manifest.json'
   - Cache name: reach-shell-v1
   - NEVER intercept /v1/* API calls — always network
   - NEVER intercept non-GET requests
   - Navigation → serve /index.html from cache (SPA shell)
   - Static assets in SHELL_URLS → cache-first
   - Activate: delete old caches, clients.claim()
*/

const CACHE_NAME = 'reach-shell-v1';
const SHELL_URLS = ['/', '/index.html', '/manifest.json'];

// ── Install: pre-cache shell ───────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ── Activate: prune old caches ────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: strict rules from 08_SECURITY.md ───────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // NEVER intercept API calls — always hit network
  if (url.pathname.startsWith('/v1/')) return;

  // NEVER intercept non-GET requests (POST/PATCH/DELETE always go to network)
  if (request.method !== 'GET') return;

  // Navigation requests → network-first, falling back to the cached shell
  // only when offline (audit 6.4). Cache-first here risked serving a stale
  // index.html across deploys unless CACHE_NAME was bumped by hand every
  // release; network-first always gets the latest shell when online.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          caches.open(CACHE_NAME).then(cache => cache.put('/index.html', response.clone()));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Shell URLs: cache-first
  if (SHELL_URLS.some(u => url.pathname === u) || url.pathname.match(/\.(js|css|png|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200 || response.type !== 'basic') return response;
          caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          return response;
        });
      })
    );
  }
});
