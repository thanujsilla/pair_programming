/* CalcInk service worker (generated into dist/sw.js at build time).
 * Precaches every built file (app shell, model, WASM runtime) so the app
 * reloads and runs with no network at all. Purely local: no network use beyond
 * fetching our own files once. */
const CACHE = 'calcink-__BUILD_ID__';
const FILES = __PRECACHE__;
const scope = self.registration.scope;
const abs = (p) => new URL(p, scope).href;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES.map(abs)))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('calcink-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (hit) return hit;
      if (req.mode === 'navigate') {
        const shell = await cache.match(abs('index.html'));
        if (shell) return shell;
      }
      return fetch(req);
    }),
  );
});
