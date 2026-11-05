/* ============================================
   LOWPASS — Route Proxy (Next.js 16)

   Protects authenticated routes AND carries the security-audit
   CSRF defense (§M3). In Next 16 the old `middleware.ts` was renamed
   to `proxy.ts`; the audit's `middleware.ts` logic is folded in here
   (you can only have one of the two files).

   Order of operations:
   1. CSRF Origin allowlist on state-changing methods (POST/PUT/PATCH/
      DELETE) — runs on EVERY matched route, including /api/. A forged
      cross-site write from another origin is rejected with 403.
      Server-to-server callers (Vercel Cron, webhooks) send no Origin
      header and pass through to their own secret checks (e.g. CRON_SECRET).
   2. /api/ routes handle their own auth (createServerSupabaseClient) and
      must return JSON rather than redirects — so after the CSRF check they
      short-circuit (no session redirect).
   3. Page routes: existing Supabase session refresh + login redirects via
      updateSession() — behaviour unchanged.
   ============================================ */

import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase-middleware';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function isAllowedOrigin(origin: string, request: NextRequest): boolean {
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false; // unparseable Origin → reject
  }
  // Same-origin: the Origin host matches the request host.
  if (host === request.nextUrl.host) return true;
  // Configured canonical app URL (e.g. production domain).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      if (host === new URL(appUrl).host) return true;
    } catch {
      /* ignore malformed env */
    }
  }
  // Vercel preview deployments (*.vercel.app).
  if (host.endsWith('.vercel.app')) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  // 1. CSRF Origin check on mutations (§M3). Only enforced when an Origin
  //    header is present (browsers always set it on cross-site writes);
  //    an absent Origin means a non-browser/server caller, handled by its
  //    own auth (e.g. CRON_SECRET).
  if (MUTATING.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && !isAllowedOrigin(origin, request)) {
      return new NextResponse(JSON.stringify({ error: 'Cross-origin request blocked' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  // 2. API routes do their own auth and must not be redirected.
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next({ request });
  }

  // 3. An email link that came back to the HOME page instead of
  //    /auth/callback. Supabase sends a confirm / magic link to its Site URL
  //    root whenever the requested return address isn't on its Redirect URLs
  //    allow-list, so the one-time `code` (or `token_hash` + `type`) arrives
  //    at "/" — where nothing reads it, so the new account never signs in.
  //    Hand it to the callback that does. Root only: no other page uses these.
  const forward = authLinkForward(request.nextUrl);
  if (forward) return NextResponse.redirect(forward);

  // 4. Page routes: session refresh + auth redirects (unchanged).
  return await updateSession(request);
}

/** "/?code=…" or "/?token_hash=…&type=…" → the same params on /auth/callback. */
export function authLinkForward(url: URL): URL | null {
  if (url.pathname !== '/') return null;
  const p = url.searchParams;
  if (!p.get('code') && !(p.get('token_hash') && p.get('type'))) return null;
  const to = new URL('/auth/callback', url);
  to.search = p.toString();
  return to;
}

export const config = {
  matcher: [
    /*
     * Match page routes AND api routes — api is now included so the CSRF
     * check above covers state-changing API calls. Skip only Next internals
     * and static assets.
     *
     * A-closeout: sw.js / manifest.webmanifest / icons/* are PUBLIC PWA assets —
     * they must never redirect to /login. An unauthenticated /sw.js redirect
     * silently blocked service-worker updates for logged-out browsers, which is
     * how the stale v1 SW survived deploys.
     */
    '/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
};
