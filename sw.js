/* Gaspol service worker — offline-first shell cache (PRD §8: works in a basement gym). */
const CACHE = 'gaspol-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './config.js',
  './foodvision.js',
  './manifest.webmanifest',
  './icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const network = fetch(e.request)
        .then((res) => {
          // Cache same-origin assets, plus the on-device food-vision model
          // (TF.js / MobileNet from esm.sh, served with CORS) so it works
          // offline after the first classification.
          const host = new URL(e.request.url).host;
          const cacheable = res && res.status === 200 &&
            (res.type === 'basic' || (res.type === 'cors' && /(^|\.)esm\.sh$/.test(host)));
          if (cacheable) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
