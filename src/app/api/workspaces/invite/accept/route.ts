/* ============================================
   LOWPASS — Workspaces / invite / accept (Sprint 9 §3)

   POST /api/workspaces/invite/accept
     Body: { token }. Calls accept_workspace_invite SECURITY
     DEFINER RPC which validates the token, creates the
     workspace_members row + tags + grants, marks invite
     accepted, and conditionally sets profiles.workspace_id.
     This route then FORCES the switch — see the block below; the
     RPC's condition cannot fire for an invited signup.
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

  /* ── LAND THEM IN THE WORKSPACE THEY JUST JOINED ────────────────────────
     The RPC sets profiles.workspace_id only when the accepted workspace is the
     user's FIRST membership (migration 080, "refinement B"). That condition can
     never hold for someone who signed up to accept an invite: handle_new_user()
     auto-provisions a workspace and a membership for EVERY new auth user, so by
     the time they accept they already have one, the count is 2, and the update
     is skipped. They land in their own empty workspace — no artists, no venues,
     no tours — and every screen looks like a broken product. Nobody reports
     that; they just leave.

     Accepting an invite is an explicit act: you followed a link to join that
     workspace, so that is where you should be. If you already belonged to
     others, landing in the new one is still right — the switcher moves you
     back.

     Done here rather than only in SQL because migrations are hand-applied and
     this must not wait on a paste. The RPC is fixed too (migration 254); this
     stays afterwards as the belt to its braces, and is a no-op once the row
     already points at the right workspace. */
  if (typeof workspaceId === 'string' && workspaceId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('workspace_id')
      .eq('id', user.id)
      .maybeSingle();
    if (profile?.workspace_id !== workspaceId) {
      const { error: switchErr } = await supabase
        .from('profiles')
        .update({ workspace_id: workspaceId })
        .eq('id', user.id);
      /* Do NOT fail the accept — membership is already created and the invite
         is marked accepted. Landing in the wrong workspace is recoverable with
         the switcher; a 500 here would strand a user who IS now a member. */
      if (switchErr) console.error('invite accepted but workspace switch failed', switchErr);
    }
  }

  return NextResponse.json({ workspace_id: workspaceId });
}
