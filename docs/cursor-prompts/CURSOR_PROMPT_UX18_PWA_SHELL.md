# UX18 — PWA Shell + Manifest

> Foundation for Phase E. Adds a PWA manifest, service worker, install prompt, and offline shell. **No mobile-specific layouts yet** — UX19 (receipt capture) and UX20 (document read) build those. UX18 is just the install + offline plumbing.

---

## 0. Context for Cursor

Read first:

1. `docs/cursor-prompts/UX_OVERHAUL_ROADMAP.md` — section 6 (mobile PWA scope).
2. `next.config.ts` — current Next config; PWA setup goes here.
3. `public/` — current static assets.
4. UX02–UX17 (must be merged).

---

## 1. Why this prompt exists

The user wants Lowpass installable on iOS/Android home screens with offline-shell behaviour, but not a native app. PWA gives that without a separate codebase. Two mobile flows (receipts + advance read) come in UX19/UX20 — UX18 just enables installability.

---

## 2. Hard rules

1. **Service worker scope = the whole app**, but only the shell + static assets are cached. Live data (Supabase queries) is not cached for v1.
2. **Manifest** at `public/manifest.webmanifest` with name, short name, start URL, theme color, icons.
3. **Icons** in `public/icons/` covering required sizes (192, 256, 384, 512, 512 maskable).
4. **Install prompt** shown only on mobile + only after the user has been authenticated and visited the app at least 3 times.
5. **Offline shell** — when offline, show a branded "you're offline" page with cached navigation; existing cached pages still render.
6. **Don't break desktop.** Service worker must not interfere with desktop dev or production builds. Test in incognito.
7. **No new dependencies.** Use Next 16's built-in `next-pwa` if compatible, or write the service worker by hand. **Confirm with user before adding `next-pwa` if there's any uncertainty about Next 16 compat.**
8. Lint + typecheck clean.

---

## 3. Step 1 — Manifest

Create `public/manifest.webmanifest`:

```json
{
  "name": "Lowpass",
  "short_name": "Lowpass",
  "description": "Tour management for music professionals",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0F0F0F",
  "theme_color": "#FF4500",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-256.png", "sizes": "256x256", "type": "image/png" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-512-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

Reference it from `<head>` in the root layout: `<link rel="manifest" href="/manifest.webmanifest" />`.

Add Apple-specific tags too:
```html
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="Lowpass" />
```

---

## 4. Step 2 — Icons

Create the 5 icon files in `public/icons/`. Use the existing Lowpass logo. Maskable variant: 80% safe-zone padding around the logo. Generate via `sharp` script if needed (place in `scripts/generate-icons.ts`, run once, commit outputs — don't keep `sharp` as a runtime dep).

If the user already has icon assets in `public/`, prefer those.

---

## 5. Step 3 — Service worker

File: `public/sw.js` (handwritten — small enough to skip a library)

Cache strategy:
- **App shell** (HTML for /, /dashboard, /offline): `cache-first`
- **Static assets** (JS, CSS, images, fonts): `cache-first`
- **API routes** (`/api/*`): `network-only` (don't cache live data)
- **Fallback** to `/offline.html` when offline and request is a navigation

Implementation skeleton:
```js
const CACHE_NAME = 'lowpass-v1';
const SHELL_URLS = ['/', '/dashboard', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    return; // network-only
  }
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/offline.html'))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
```

### 5.1 Registration

In a client component mounted at app root:
```ts
useEffect(() => {
  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker.register('/sw.js').catch(() => {/* silent */});
  }
}, []);
```

Don't register in dev — interferes with hot reload.

---

## 6. Step 4 — Offline page

Create `src/app/offline.tsx` (or `public/offline.html` if static is preferred):
- Lowpass logo
- Heading: "You're offline"
- Body: "Some pages you've already visited may still be available. Reconnect to load fresh data."
- Button: "Try again" (calls `window.location.reload()`)

Use design tokens. Match the rest of the app's aesthetic.

---

## 7. Step 5 — Install prompt

Create `src/components/pwa/InstallPrompt.tsx`:
- Listens for the `beforeinstallprompt` event
- Stores the prompt event in a ref
- Renders a small banner (only on mobile widths, only after 3rd visit) with "Install Lowpass" button
- Click → calls the stored prompt's `prompt()` method
- Dismiss button stores a localStorage flag to suppress for 30 days

Mount once at app root (next to `<EntityRoutingProvider>`).

iOS Safari doesn't support `beforeinstallprompt`. Detect iOS Safari and instead show a small "Tap the Share icon, then 'Add to Home Screen'" hint banner. Same dismiss + 30-day suppress logic.

---

## 8. Step 6 — Visit counter

Track app visits via localStorage:
```ts
const visits = parseInt(localStorage.getItem('lp:visits') ?? '0', 10);
localStorage.setItem('lp:visits', String(visits + 1));
```

Increment once per session (use sessionStorage to debounce). Install prompt checks `visits >= 3`.

---

## 9. Verification

1. Lint + typecheck clean
2. Build runs (this is the one prompt where running build is necessary to test PWA — but only after the user has moved off Drive; if Drive is still the filesystem, document that build verification is deferred to user's local machine)
3. In Chrome devtools → Application → Manifest: shows manifest with all icons
4. Application → Service Workers: registers in production builds
5. Application → Storage: sees cached assets after first visit
6. Lighthouse PWA audit scores 90+
7. Offline mode (Network tab → Offline) renders /offline.html for navigation requests
8. Install prompt appears on mobile after 3 visits
9. iOS Safari hint banner appears on iOS
10. Dismiss persists for 30 days

---

## 10. Acceptance criteria

- [ ] `manifest.webmanifest` valid and linked
- [ ] 5 icon sizes generated and committed
- [ ] Service worker handles cache + offline
- [ ] Offline page exists and is cached
- [ ] Install prompt component
- [ ] iOS Safari fallback hint
- [ ] Visit counter in localStorage
- [ ] Doesn't interfere with desktop dev
- [ ] Lighthouse PWA score 90+
- [ ] Lint + typecheck clean

---

## 11. Out of scope

- ❌ Don't cache API responses or live data — UX19/20 handle offline data flows for receipts/advance specifically
- ❌ Don't implement push notifications (defer)
- ❌ Don't implement background sync (defer)
- ❌ Don't add WebShare target (defer)
- ❌ Mobile-specific layouts — UX19/UX20

---

## 12. Commit plan

Two commits:
1. `UX18: PWA manifest + icons + service worker + offline page`
2. `UX18: Install prompt + visit counter`
