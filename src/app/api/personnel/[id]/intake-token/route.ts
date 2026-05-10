/* ============================================
   LOWPASS — POST /api/personnel/[id]/intake-token (Sprint 10 §2.4)

   Workspace admin generates a fresh public-shareable intake
   token for the personnel record. Returns the token + the
   absolute URL the operator can paste into a message.

   Token = 32 random url-safe chars. RLS on the underlying
   personnel_intake_tokens table gates the insert via
   `can_access('page', 'operations.personnel', 'write')` so
   readonly callers can't generate tokens.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

function generateToken(): string {
  /* 24 random bytes → ~32 char base64url. Safe to use as a
     URL path segment. */
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: personnelId } = await params;

  /* Look up the personnel row's workspace_id. RLS ensures the
     caller can only see rows in their own workspace. */
  const { data: personnel, error: personnelErr } = await supabase
    .from('personnel')
    .select('id, workspace_id')
    .eq('id', personnelId)
    .maybeSingle();
  if (personnelErr) {
    return NextResponse.json({ error: personnelErr.message }, { status: 500 });
  }
  if (!personnel) {
    return NextResponse.json({ error: 'Personnel not found' }, { status: 404 });
  }

  const personnelRow = personnel as { id: string; workspace_id: string };

  const token = generateToken();
  const { error: insertErr } = await supabase
    .from('personnel_intake_tokens')
    .insert({
      personnel_id: personnelRow.id,
      workspace_id: personnelRow.workspace_id,
      token,
      invited_by_user_id: user.id,
    });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const origin = new URL(request.url).origin;
  const url = `${origin}/intake/${token}`;
  return NextResponse.json({ token, url });
}
