/* ============================================================
   LOWPASS — Edge middleware (Security audit §M3 + §L4)

   Two jobs, both additive — per-route getUser() + RLS remain the
   authoritative gate; this is a second layer:

   1. CSRF defense (§M3). For state-changing methods (POST/PUT/PATCH/
      DELETE) we enforce an Origin allowlist. Browsers always attach an
      `Origin` header on cross-site state-changing requests, so a forged
      request from evil.com carries Origin: https://evil.com and is
      rejected. Same-origin app calls match; server-to-server callers
      (Vercel Cron, webhooks) send NO Origin and are allowed through to
      their own secret/token checks (e.g. CRON_SECRET).

   2. Supabase session refresh (§L4). Previously there was NO middleware,
      so the SSR session was never refreshed centrally. We refresh it here
      (the documented @supabase/ssr pattern) so expiring tokens roll over.

   Matcher excludes static assets to keep this off the hot path.
   ============================================================ */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

export async function middleware(request: NextRequest) {
  // 1. CSRF Origin check on mutations. Only enforced when an Origin header
  //    is present (browser cross-site requests always set it); absent Origin
  //    means a non-browser/server caller, which we let its own auth handle.
  if (MUTATING.has(request.method)) {
    const origin = request.headers.get('origin');
    if (origin && !isAllowedOrigin(origin, request)) {
      return new NextResponse(JSON.stringify({ error: 'Cross-origin request blocked' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      });
    }
  }

  // 2. Refresh the Supabase session (cookie roll-over). Must return the
  //    same response object whose cookies were mutated.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
    // Touch the session so @supabase/ssr refreshes an expiring token.
    await supabase.auth.getUser();
  }

  return response;
}

export const config = {
  // Run on everything except Next internals and static files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)'],
};
