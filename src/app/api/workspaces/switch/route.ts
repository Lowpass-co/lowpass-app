/* ============================================
   LOWPASS — Workspaces / switch (Sprint 9 §3)

   POST /api/workspaces/switch
     Body: { workspace_id }. Verifies the caller has a
     workspace_members row for the target workspace, then
     updates profiles.workspace_id to the new active workspace.
     Client should call router.refresh() after a 200 to reload
     server components under the new RLS scope.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { workspace_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const targetWorkspaceId =
    typeof body.workspace_id === 'string' ? body.workspace_id : '';
  if (!UUID_RE.test(targetWorkspaceId)) {
    return NextResponse.json(
      { error: 'workspace_id must be a UUID' },
      { status: 400 },
    );
  }

  // Verify membership. workspace_members RLS is self-only
  // (SELECT user_id = auth.uid()), so this filter is sufficient.
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, role')
    .eq('user_id', user.id)
    .eq('workspace_id', targetWorkspaceId)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json(
      { error: 'Not a member of that workspace' },
      { status: 403 },
    );
  }

  const { error: updErr } = await supabase
    .from('profiles')
    .update({ workspace_id: targetWorkspaceId })
    .eq('id', user.id);

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Audit (target workspace)
  await supabase.from('audit_log').insert({
    workspace_id: targetWorkspaceId,
    actor_user_id: user.id,
    action: 'switched',
    entity_type: 'workspace_active',
    entity_id: null,
    field_changes: { switched_to: targetWorkspaceId },
  });

  return NextResponse.json({ ok: true, workspace_id: targetWorkspaceId });
}
