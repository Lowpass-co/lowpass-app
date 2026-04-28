/* Lowpass — app shell cache + offline fallback. Version bump on shell changes. */
const CACHE_NAME = 'lowpass-v1';
const SHELL_URLS = ['/', '/dashboard', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        SHELL_URLS.map((url) =>
          cache.add(url).catch(() => {
            /* Precache failures are ignored (e.g. auth redirects). */
          })
        )
      )
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** Full document loads — cache HTML for offline revisit. */
function isNavigationDocument(request, url) {
  return (
    url.origin === self.location.origin &&
    !url.pathname.startsWith('/api/') &&
    request.method === 'GET' &&
    (request.mode === 'navigate' || request.destination === 'document')
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  if (url.pathname.startsWith('/api/')) {
    return;
  }

  if (req.method !== 'GET') {
    return;
  }

  /* HTML documents — network first, cache successes, offline fallback */
  if (isNavigationDocument(req, url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok && res.url.startsWith(self.location.origin)) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(req, res.clone());
          }
          return res;
        } catch {
          const cachedDoc = await caches.match(req);
          if (cachedDoc) return cachedDoc;
          const offlinePage = await caches.match('/offline.html');
          return offlinePage || new Response('', { status: 503 });
        }
      })()
    );
    return;
  }

  /* Static assets — cache-first, then populate cache */
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;

      try {
        const network = await fetch(req);
        if (network.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, network.clone()).catch(() => {});
        }
        return network;
      } catch {
        return caches.match(req);
      }
    })()
  );
});
