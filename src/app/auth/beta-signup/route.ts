/* ============================================
   POST /auth/beta-signup — make an account, by code (Nov 2026, Adam)

   Public sign-up is OFF in Supabase; accounts are made here, server-side,
   with one of:
     { code, email, password, name }   a beta code made for that email
                                       (/admin/beta-codes) → the tester's own
                                       workspace (handle_new_user + 290)
     { invite, password, name }        a crew/teammate invite token → the
                                       account for the invited email; the
                                       browser then accepts the invite as usual
   Either one reached the person at that email, so the account is created
   already confirmed. Then the browser signs in with the password.

   The code is CLAIMED before the account is made (one UPDATE … WHERE
   redeemed_at IS NULL), so two tabs can't both spend it; if making the
   account fails, the claim is released.
   Public path: /auth/* is on the auth allow-list (publicRoutes.isAuthPath).
   ============================================ */
import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase-server';
import { betaCodeProblem, normaliseBetaCode, type BetaCodeRow } from '@/lib/auth/betaCodes';
import { checkRateLimit, markRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/* Per-IP throttle: one attempt per 3 s. In-memory (per instance) — a speed
   bump against guessing, not the defence: a code is ~59 random bits AND
   must match its email. */
const attempts = new Map<string, number>();

function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const limited = checkRateLimit(attempts, ip, 3000);
  if (limited) return limited;
  markRateLimit(attempts, ip);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const password = typeof body?.password === 'string' ? body.password : '';
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 120) : '';
  if (password.length < 8) return bad('Use a password of at least 8 characters.');
  if (!name) return bad('Add your name.');

  const admin = createServiceSupabaseClient();

  /* ---- Invite token (crew / teammates) ---- */
  if (typeof body?.invite === 'string' && body.invite) {
    const { data: invite } = await admin
      .from('workspace_invites')
      .select('id, invited_email, accepted_at, expires_at')
      .eq('token', body.invite)
      .maybeSingle();
    const inv = invite as { invited_email: string; accepted_at: string | null; expires_at: string } | null;
    if (!inv) return bad('That invite link isn’t right.');
    if (inv.accepted_at) return bad('That invite has already been used — sign in instead.');
    if (new Date(inv.expires_at) < new Date()) return bad('That invite has expired — ask for a new one.');
    const created = await admin.auth.admin.createUser({
      email: inv.invited_email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (created.error) return bad(friendly(created.error.message), 409);
    return NextResponse.json({ email: inv.invited_email });
  }

  /* ---- Beta code (a tester's own workspace) ---- */
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  const code = typeof body?.code === 'string' ? normaliseBetaCode(body.code) : '';
  if (!EMAIL_RE.test(email)) return bad('Add the email your code was sent to.');
  if (!code) return bad('Add your beta code.');

  const { data: row } = await admin
    .from('beta_codes')
    .select('id, email, expires_at, revoked_at, redeemed_at')
    .eq('code', code)
    .maybeSingle();
  const problem = betaCodeProblem(row as BetaCodeRow | null, email);
  if (problem) return bad(problem);

  const id = (row as BetaCodeRow).id;
  const { data: claimed } = await admin
    .from('beta_codes')
    .update({ redeemed_at: new Date().toISOString() })
    .eq('id', id)
    .is('redeemed_at', null)
    .is('revoked_at', null)
    .select('id');
  if (!claimed?.length) return bad('That code has already been used.');

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (created.error || !created.data.user) {
    await admin.from('beta_codes').update({ redeemed_at: null }).eq('id', id);
    return bad(friendly(created.error?.message ?? 'Could not create the account'), 409);
  }
  await admin.from('beta_codes').update({ redeemed_user_id: created.data.user.id }).eq('id', id);
  return NextResponse.json({ email });
}

function friendly(message: string): string {
  return /already|registered|exists/i.test(message)
    ? 'There’s already an account for that email — sign in instead.'
    : message;
}
