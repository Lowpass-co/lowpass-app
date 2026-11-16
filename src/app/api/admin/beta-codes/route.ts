/* ============================================
   /api/admin/beta-codes — site admin makes and turns off beta codes (Nov 2026)
     GET                      → { codes: [...] }
     POST  { email, note? }   → { code }          one per email at a time
     PATCH { id, revoke: true } → { ok }
   Site admin only (requireSiteAdmin + beta_codes RLS, migration 292).
   ============================================ */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, requireSiteAdmin } from '@/lib/supabase-admin';
import { generateBetaCode } from '@/lib/auth/betaCodes';

export const dynamic = 'force-dynamic';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COLS = 'id, code, email, note, created_at, expires_at, revoked_at, redeemed_at, redeemed_user_id';

export async function GET() {
  const supabase = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(supabase);
  } catch (e) {
    const r = adminErrorResponse(e);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  const { data, error } = await supabase.from('beta_codes').select(COLS).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ codes: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  let admin: { id: string };
  try {
    admin = await requireSiteAdmin(supabase);
  } catch (e) {
    const r = adminErrorResponse(e);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  const body = (await request.json().catch(() => null)) as { email?: unknown; note?: unknown } | null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: 'A valid email is needed' }, { status: 400 });
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 200) || null : null;

  // One live code per email: turn off any unused one first.
  await supabase
    .from('beta_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('email', email)
    .is('redeemed_at', null)
    .is('revoked_at', null);

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from('beta_codes')
      .insert({ code: generateBetaCode(), email, note, created_by: admin.id })
      .select(COLS)
      .single();
    if (!error) return NextResponse.json({ code: data });
    if (error.code !== '23505') return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ error: 'Could not make a unique code — try again' }, { status: 500 });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(supabase);
  } catch (e) {
    const r = adminErrorResponse(e);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }
  const body = (await request.json().catch(() => null)) as { id?: unknown; revoke?: unknown } | null;
  if (typeof body?.id !== 'string' || body.revoke !== true) {
    return NextResponse.json({ error: 'id and revoke: true are needed' }, { status: 400 });
  }
  const { error } = await supabase
    .from('beta_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', body.id)
    .is('redeemed_at', null);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
