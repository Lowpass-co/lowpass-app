/* Lowpass — app shell cache + offline fallback. Version bump on shell changes.

   P0 (alignment pass): the previous v1 handled NAVIGATIONS network-first and did
   `await cache.put(req, res.clone())` before returning the response. For Next's
   streaming RSC/HTML responses the clone's body only completes when the whole
   stream (all Suspense) finishes, so awaiting the cache write held the navigation
   response open — the document painted but never reached idle, site-wide, in
   production only (the SW persists across deploys, which is why a clean deploy
   didn't clear it). v2 no longer intercepts navigations at all: HTML/RSC always
   goes straight to the network, untouched. Only hashed static assets are cached
   (cache-first, fire-and-forget put — never awaited). CACHE_NAME bump forces the
   new SW to activate + purge the old cache (including any cached navigations). */
const CACHE_NAME = 'lowpass-v2';
const PRECACHE_URLS = ['/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE_URLS.map((url) =>
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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Never touch API calls or non-GET.
  if (url.pathname.startsWith('/api/') || req.method !== 'GET') {
    return;
  }

  // P0 — NEVER intercept navigations / documents. Next streams HTML+RSC; letting
  // the SW proxy or cache that stream is what held the load open. Pass through to
  // the network untouched. (Offline navigation fallback is dropped deliberately —
  // a working online site outranks an offline shell.)
  if (
    req.mode === 'navigate' ||
    req.destination === 'document' ||
    url.pathname.startsWith('/_next/data/')
  ) {
    return;
  }

  // Same-origin static assets only — cache-first. Chunks are content-hashed, so a
  // cached asset is never stale. The cache write is fire-and-forget (never awaited)
  // so it can't delay the response.
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
          caches.open(CACHE_NAME).then((cache) => cache.put(req, network.clone())).catch(() => {});
        }
        return network;
      } catch {
        return (await caches.match(req)) || Response.error();
      }
    })()
  );
});
