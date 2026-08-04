/* ============================================
   LOWPASS — Workspaces / invite / [id] (Sprint 9 §3)

   DELETE /api/workspaces/invite/[id]
     Revoke a pending invite. Admin-only via workspace_invites
     RLS. Setting accepted_at = now() with accepted_user_id = null
     would mis-signal "accepted" — instead we DELETE the row,
     which is unambiguous and matches "Revoke" UX.

   POST /api/workspaces/invite/[id]/resend
     Resend invalidates the previous link by deleting the old
     row + creating a fresh one with a new token + new 14-day
     expiry, copying the role/tags/grants from the original.
     Wire is mounted on POST to /[id]/resend below in resend/route.ts.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: inviteId } = await params;
  if (!inviteId) {
    return NextResponse.json({ error: 'invite id required' }, { status: 400 });
  }

  // Look up first to surface the workspace_id for audit.
  const { data: invite } = await supabase
    .from('workspace_invites')
    .select('id, workspace_id, invited_email, accepted_at')
    .eq('id', inviteId)
    .maybeSingle();

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
  }
  const i = invite as {
    id: string;
    workspace_id: string;
    invited_email: string;
    accepted_at: string | null;
  };

  if (i.accepted_at) {
    return NextResponse.json(
      { error: 'Invite already accepted; cannot revoke' },
      { status: 409 },
    );
  }

  const { error: delErr } = await supabase
    .from('workspace_invites')
    .delete()
    .eq('id', inviteId);

  if (delErr) {
    const status = delErr.code === '42501' ? 403 : 500;
    return NextResponse.json({ error: delErr.message }, { status });
  }

  await supabase.from('audit_log').insert({
    workspace_id: i.workspace_id,
    actor_user_id: user.id,
    action: 'deleted',
    entity_type: 'workspace_invite',
    entity_id: inviteId,
    field_changes: { revoked_email: i.invited_email },
  });

  return NextResponse.json({ ok: true });
}
