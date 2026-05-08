/* ============================================
   LOWPASS — /api/admin/users/[id]/memberships/[memberId] (Sprint 9 §10)

   DELETE — remove a user from a workspace. Site-admin only.
            Strips the workspace_members row + permission_grants
            keyed on this user/workspace + tags via FK cascade.
            If the deleted membership was the user's active
            workspace, also clear profiles.workspace_id (auto-
            switch is handled when they next sign in or via the
            archive endpoint's similar logic; here we just null
            it out and let the user pick).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  adminErrorResponse,
  createServiceSupabaseAdminClient,
  requireSiteAdmin,
} from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  let actor: { id: string; email: string | null };
  try {
    actor = await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { id: targetUserId, memberId } = await params;
  if (!targetUserId || !memberId) {
    return NextResponse.json({ error: 'ids required' }, { status: 400 });
  }

  // Use service role to bypass RLS — the path here is admin-only,
  // gated by requireSiteAdmin above.
  const admin = createServiceSupabaseAdminClient();

  const { data: membership } = await admin
    .from('workspace_members')
    .select('id, user_id, workspace_id, is_workspace_owner')
    .eq('id', memberId)
    .maybeSingle();
  if (!membership) {
    return NextResponse.json({ error: 'Membership not found' }, { status: 404 });
  }
  const m = membership as {
    id: string;
    user_id: string;
    workspace_id: string;
    is_workspace_owner: boolean;
  };
  if (m.user_id !== targetUserId) {
    return NextResponse.json(
      { error: 'Membership does not belong to that user' },
      { status: 400 },
    );
  }
  if (m.is_workspace_owner) {
    return NextResponse.json(
      {
        error:
          'Cannot remove the workspace owner via this endpoint. Transfer ownership first.',
      },
      { status: 403 },
    );
  }

  const { error: delErr } = await admin
    .from('workspace_members')
    .delete()
    .eq('id', memberId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Clean up user-direct permission_grants for this user in this
  // workspace (they don't FK-cascade off workspace_members).
  await admin
    .from('permission_grants')
    .delete()
    .eq('workspace_id', m.workspace_id)
    .eq('subject_type', 'user')
    .eq('subject_id', m.user_id);

  // If this was the target user's active workspace, null it out.
  // Their next page load will surface "No active workspace" until
  // they pick one via the switcher.
  await admin
    .from('profiles')
    .update({ workspace_id: null })
    .eq('id', m.user_id)
    .eq('workspace_id', m.workspace_id);

  await supabase.from('audit_log').insert({
    workspace_id: m.workspace_id,
    actor_user_id: actor.id,
    action: 'deleted',
    entity_type: 'workspace_member',
    entity_id: memberId,
    field_changes: {
      removed_user_id: m.user_id,
      via: 'site_admin',
    },
  });

  return NextResponse.json({ ok: true });
}
