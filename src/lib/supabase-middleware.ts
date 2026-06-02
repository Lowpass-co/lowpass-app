/* ============================================
   LOWPASS — Supabase Middleware Client

   Creates a Supabase client for use in
   Next.js middleware (route protection).
   ============================================ */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

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

  // If no user and trying to access protected routes, redirect to login.
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/signup') ||
    request.nextUrl.pathname.startsWith('/auth');
  /* Sprint 10 Phase 2.1 §5.4 — public-by-token routes that
     legitimately render to unauth visitors:
       /r/             rider-pack public share links
       /invite/accept  workspace-invite landing (Sprint 9 §3 +
                       §14.3 — InviteAcceptUnauth panel offers
                       sign-in / sign-up with the token preserved
                       via `next`)
       /intake/        personnel intake forms (Sprint 10 §2.4 —
                       token-gated public form)
     Without these, the middleware redirected unauth visitors
     to /login, dropping them on a login page with no path back
     to the InviteAcceptUnauth panel. Per Adam's smoke 5.4. */
  const isPublicRoute =
    request.nextUrl.pathname.startsWith('/r/') ||
    request.nextUrl.pathname.startsWith('/invite/accept') ||
    request.nextUrl.pathname.startsWith('/intake/') ||
    /* Dev-only: the Stage Plot icon catalog (§SP1a) renders with
       no data and is gated to non-production by the page itself.
       Allowlisted here so it can be browsed without a session
       while building the icon library. Never public in prod. */
    (process.env.NODE_ENV !== 'production' &&
      request.nextUrl.pathname.startsWith('/stage-plot-'));

  if (!user && !isAuthRoute && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // If user exists and on auth route, redirect to dashboard.
  // Public routes (e.g. /r/[token]) are fine to visit while signed in —
  // do NOT redirect authenticated users away from them.
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
