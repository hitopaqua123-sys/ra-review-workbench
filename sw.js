// Service Worker — app shell offline cache for PWA
// offline-first: navigation -> cached app shell; static assets -> cache-first (stale-while-revalidate)
const CACHE = 'review-admin-v28';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'seed_data.js',
  'vendor/chart.umd.min.js',
  'vendor/xlsx.full.min.js',
  'vendor/fflate.umd.min.js',
  'vendor/fonts/fonts.css',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-192.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // resilient: a single 404 must NOT abort the whole install
    await Promise.all(
      SHELL.map((u) => c.add(u).catch((err) => console.warn('SW skip (shell):', u, err)))
    );
    // best-effort: cache every woff2 referenced by fonts.css so fonts work offline too
    try {
      const cssText = await (await fetch('vendor/fonts/fonts.css')).text();
      const urls = [...cssText.matchAll(/url\((['"]?)([^)'"]+\.woff2)\1\)/g)].map((m) => m[2]);
      await Promise.all(urls.map((u) => c.add(u).catch(() => {})));
    } catch (err) {
      console.warn('SW font pre-cache skipped:', err);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Navigation (HTML): network-first, fall back to cached app shell when offline
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('index.html').then((r) => r || caches.match('./')))
    );
    return;
  }

  // Critical app code (app.js / styles.css): NETWORK-FIRST so a fresh deploy
  // is always picked up online (no more stale cached logic). Falls back to cache offline.
  const url = new URL(req.url);
  if (/\/(app\.js|styles\.css)(\?|$)/.test(url.pathname)) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Other static assets: cache-first (stale-while-revalidate)
  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
