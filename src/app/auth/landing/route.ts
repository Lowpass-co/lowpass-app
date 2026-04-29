/* ============================================
   LOWPASS — Post-auth landing route

   After successful auth (password sign-in or OAuth callback), the
   client pushes the user here. We resolve the right destination
   server-side and 307 to it.

   `?next=<path>` overrides the artist-count logic so deep links
   survive the auth round-trip. Only same-origin paths are honoured.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolvePostAuthLanding } from '@/lib/auth/landing';

function isSafeNext(next: string | null): next is string {
  if (!next) return false;
  // Must be a relative path on this origin. Reject protocol-relative
  // (//evil.com) and anything that doesn't start with a single slash.
  return next.startsWith('/') && !next.startsWith('//');
}

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const next = searchParams.get('next');

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Not signed in — bounce back to login. Preserve `next` so the
    // user lands where they wanted after re-auth.
    const loginUrl = new URL('/login', origin);
    if (isSafeNext(next)) loginUrl.searchParams.set('next', next);
    return NextResponse.redirect(loginUrl);
  }

  if (isSafeNext(next)) {
    return NextResponse.redirect(`${origin}${next}`);
  }

  const path = await resolvePostAuthLanding(supabase, user.id);
  return NextResponse.redirect(`${origin}${path}`);
}
