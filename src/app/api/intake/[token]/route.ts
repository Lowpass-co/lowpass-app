/* ============================================
   LOWPASS — GET /api/intake/[token] (Sprint 10 §2.4)

   Public endpoint — no auth required. Returns workspace name +
   personnel display name + already-submitted timestamp for the
   intake form to render. Backed by the SECURITY DEFINER RPC
   `lookup_personnel_intake` (migration 088) which validates the
   token + expiry without leaking data on invalid tokens.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: 'Token required' }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc('lookup_personnel_intake', { p_token: token })
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json(
      { error: 'Token invalid or expired' },
      { status: 404 },
    );
  }
  const row = data as {
    token: string;
    workspace_name: string;
    personnel_name: string;
    expires_at: string;
    submitted_at: string | null;
  };
  return NextResponse.json({
    token: row.token,
    workspaceName: row.workspace_name,
    personnelName: row.personnel_name,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at,
  });
}
