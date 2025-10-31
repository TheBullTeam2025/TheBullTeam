const VERSION = 'v0.5.1';
const PRECACHE = `thebullteam-precache-${VERSION}`;
const RUNTIME = `thebullteam-runtime-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dishes-data.js',
  './bar_drinks.js',
  './search-filters.css',
  './dishes.json',
  './manifest.webmanifest',
  './The Bull-128.png',
  './The Bull-512.png',
  './TableBull.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== PRECACHE && k !== RUNTIME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for menu data JSON (keeps data fresh)
  if (request.url.includes('dishes.json') || request.url.includes('bar_drinks.json')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(RUNTIME).then(cache => cache.put(request, copy)).catch(() => {});
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return (
            cached || new Response('{"dishes":[]}', { headers: { 'Content-Type': 'application/json' } })
          );
        })
    );
    return;
  }

  // Stale-while-revalidate for other requests
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((networkResponse) => {
          const copy = networkResponse.clone();
          caches.open(RUNTIME).then(cache => cache.put(request, copy)).catch(() => {});
          return networkResponse;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

// Allow the page to tell SW to skip waiting
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});


