/* ============================================
   LOWPASS — /api/admin/users/[id] (Sprint 9 §10)

   DELETE — cascade-delete a user via Supabase Auth admin.
            Profile + all workspace_members + permission_grants
            cascade via existing FKs. Site-admin only.

   Cannot delete yourself — guard at the route layer.
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
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  let actor: { id: string; email: string | null };
  try {
    actor = await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: 'user id required' }, { status: 400 });
  }
  if (targetUserId === actor.id) {
    return NextResponse.json(
      { error: 'Cannot delete yourself.' },
      { status: 403 },
    );
  }

  // Snapshot the target's email + memberships before delete for
  // the audit row.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id, email, name')
    .eq('id', targetUserId)
    .maybeSingle();

  const admin = createServiceSupabaseAdminClient();
  const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Audit log — workspace_id is NULL because user delete is a
  // platform-level action; the audit_log row carries the actor
  // and the snapshot. Sprint 10's audit dispatcher reads it via
  // entity_type = 'user'. workspace_id is NOT NULL in the
  // schema, so we use the actor's active workspace as a sentinel
  // anchor.
  const { data: actorProfile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', actor.id)
    .maybeSingle();
  const anchorWorkspace =
    (actorProfile as { workspace_id?: string | null } | null)?.workspace_id;
  if (anchorWorkspace) {
    await supabase.from('audit_log').insert({
      workspace_id: anchorWorkspace,
      actor_user_id: actor.id,
      action: 'deleted',
      entity_type: 'user',
      entity_id: targetUserId,
      field_changes: {
        deleted_email:
          (targetProfile as { email?: string } | null)?.email ?? null,
        deleted_name:
          (targetProfile as { name?: string } | null)?.name ?? null,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
