/* ============================================
   LOWPASS — Auth Callback

   Handles the OAuth redirect from Google
   and email confirmation links.
   Exchanges the auth code for a session.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // Default landing is /auth/landing — that route resolves the right
  // destination based on artist count (0 → onboard, 1 → that artist's
  // hub, 2+ → picker). A `?next=` override is forwarded so deep links
  // survive the auth round-trip.
  const next = searchParams.get('next');
  const target = next && next.startsWith('/') && !next.startsWith('//') ? next : '/auth/landing';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${target}`);
    }
  }

  // If something went wrong, redirect to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
