/* ============================================
   LOWPASS — POST /api/intake/[token]/submit (Sprint 10 §2.4)

   Public endpoint — no auth required. Accepts the form payload
   (a partial PersonnelExtendedProfile) + writes it to the
   personnel record's extended_profile column. Token is single-
   use; submitting marks submitted_at and prevents replay.

   Backed by `submit_personnel_intake` (migration 088) — server-
   side merge to prevent overwriting fields the operator pre-
   filled.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

interface SubmitBody {
  payload?: Record<string, unknown>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }
  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const payload =
    body && typeof body.payload === 'object' && body.payload !== null
      ? body.payload
      : {};

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc('submit_personnel_intake', {
    p_token: token,
    p_payload: payload,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (data === false) {
    return NextResponse.json(
      { error: 'Token invalid, expired, or already submitted' },
      { status: 410 },
    );
  }
  return NextResponse.json({ ok: true });
}
