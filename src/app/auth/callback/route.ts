/* ============================================
   LOWPASS — Auth Callback (Sprint 10 §5.1)

   Handles the OAuth redirect from Google + email confirmation
   links. Exchanges the auth code for a session.

   Oct 2026 — also accepts the token-hash style of confirmation link
   (?token_hash=…&type=signup|email|recovery|invite|magiclink|email_change),
   which Supabase's newer email templates send to /auth/confirm. That
   route re-exports this handler, so EITHER template style works: a
   sign-up confirmation 404'd when the template pointed at /auth/confirm.

   Sprint 10 §5.1 — `next` query-param preservation now
   includes an open-redirect guard. Same predicate as the
   login page (Sprint 9 §14.3) — `next` must start with `/`
   and not `//` so attackers can't trick us into redirecting
   to attacker-controlled hosts via crafted invite URLs.
   ============================================ */

import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const OTP_TYPES = new Set<EmailOtpType>(['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']);

function safeNextPath(raw: string | null): string {
  if (!raw) return '/';
  if (!raw.startsWith('/')) return '/';
  if (raw.startsWith('//')) return '/';
  return raw;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // If something went wrong, redirect to login with error.
  // Preserve next so the user lands back on the deep-link
  // after re-authing.
  const loginParams = new URLSearchParams({ error: 'auth_callback_failed' });
  if (next !== '/') loginParams.set('next', next);
  return NextResponse.redirect(`${origin}/login?${loginParams.toString()}`);
}
