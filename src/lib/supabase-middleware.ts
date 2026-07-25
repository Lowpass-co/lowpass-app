/* ============================================
   LOWPASS — Supabase Middleware Client

   Creates a Supabase client for use in
   Next.js middleware (route protection).
   ============================================ */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthPath, isPublicPath } from '@/lib/auth/publicRoutes';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session if it exists
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
