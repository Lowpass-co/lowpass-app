/* ============================================
   LOWPASS — Workspaces / invite / accept (Sprint 9 §3)

   POST /api/workspaces/invite/accept
     Body: { token }. Calls accept_workspace_invite SECURITY
     DEFINER RPC which validates the token, creates the
     workspace_members row + tags + grants, marks invite
     accepted, and conditionally sets profiles.workspace_id
     (only if first workspace per Adam's refinement B).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 });
  }

  const { data: workspaceId, error: rpcErr } = await supabase.rpc(
    'accept_workspace_invite',
    { p_token: token },
  );

  if (rpcErr) {
    // Map known RPC ERRCODE to HTTP status.
    const statusByCode: Record<string, number> = {
      P0001: 401, // not authenticated (shouldn't reach — we checked above)
      P0002: 404, // not found
      P0003: 410, // already accepted (Gone)
      P0004: 410, // expired
      P0005: 403, // email mismatch
    };
    const status = statusByCode[rpcErr.code ?? ''] ?? 500;
    return NextResponse.json({ error: rpcErr.message }, { status });
  }

  return NextResponse.json({ workspace_id: workspaceId });
}
