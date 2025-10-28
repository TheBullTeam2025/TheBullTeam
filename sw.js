const CACHE_NAME = 'waiter-pwa-v6';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './dishes-data.js',
  './bar_drinks.js',
  './bar_drinks-data.js',
  './search-filters.css',
  './dishes.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Always fetch dishes.json fresh from network
  if (request.url.includes('dishes.json')) {
    event.respondWith(
      fetch(request).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, respClone)).catch(() => {});
        return resp;
      }).catch(() => {
        // Fallback for dishes.json
        return new Response('{"dishes":[]}', {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        const respClone = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, respClone)).catch(() => {});
        return resp;
      }).catch(() => {
        // Fallback for other JSON files
        if (request.url.endsWith('.json')) {
          return new Response('{"dishes":[]}', {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        return cached;
      });
    })
  );
});


