/* ============================================
   LOWPASS — Supabase Middleware Client

   Creates a Supabase client for use in
   Next.js middleware (route protection).
   ============================================ */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthPath, isPublicPath } from '@/lib/auth/publicRoutes';

export async function updateSession(request: NextRequest) {
  /* S-1 — publish the pathname to server components.
     Layouts have no usePathname, and the canonical shell derives scope, mode and
     the active rail item FROM THE URL rather than from ambient client state —
     that IS the deep-link requirement. Forwarding a request header is the
     supported way to get the URL into a server render.

     Done here rather than in proxy.ts because this function owns the response
     object the cookie refresh writes to; reconstructing the request upstream
     would put the auth cookie flow at risk to move a string. */
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', request.nextUrl.pathname);
  requestHeaders.set('x-search', request.nextUrl.search);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  /* Perf pass 1 (2026-08-04) — verify locally when possible. getUser() sends
     a round-trip to the Auth server on EVERY page navigation; getClaims()
     verifies the JWT's signature and expiry against the project's cached JWKS
     locally (asymmetric signing keys), and this middleware only needs a yes/no
     on "is this a valid session". Fallbacks keep every old behaviour:
     · expired token → getClaims rejects → getUser runs → session REFRESH
       happens exactly as before (that is updateSession's other job);
     · HS256 / legacy keys → getClaims itself takes the network path — never
       worse than the old code. */
  let user: { id: string } | null = null;
  try {
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
    const sub = claimsData?.claims?.sub;
    if (!claimsError && sub) user = { id: sub };
  } catch {
    /* fall through to the network path */
  }
  if (!user) {
    const {
      data: { user: fetched },
    } = await supabase.auth.getUser();
    user = fetched ? { id: fetched.id } : null;
  }

  /* P0 — the unauthenticated allow-list now lives in one PURE, TESTABLE module:
     src/lib/auth/publicRoutes.ts. It used to be an inline chain here, which is
     exactly why four public token routes (/advance-intake/, /m/day/, /a/,
     /share/advance/) could sit gated in production for weeks — nothing could
     unit-test a decision buried in edge middleware. publicRoutes.test.tsx now
     asserts every public path opens and every authed path stays shut, so a new
     public route that ships without an entry fails a test instead of failing
     silently in a venue's inbox. */
  const isAuthRoute = isAuthPath(request.nextUrl.pathname);
  const isPublicRoute = isPublicPath(
    request.nextUrl.pathname,
    process.env.NODE_ENV === 'production',
  );

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user exists and on an auth route, redirect to the workspace landing.
  // Nav & entry fixpack item 3 — /dashboard is retired (folded into /), so
  // sending here double-redirected through a dead URL; go straight to /artists
  // (which may single-artist-auto-skip). Public routes (e.g. /r/[token]) are
  // fine to visit while signed in — do NOT redirect authenticated users away.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/artists';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
