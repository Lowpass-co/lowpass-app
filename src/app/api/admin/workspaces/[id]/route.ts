/* ============================================
   LOWPASS — /api/admin/workspaces/[id] (Sprint 9 §10)

   PATCH — rename a workspace. Body: { name }.
   DELETE — archive (soft-delete). Sets workspaces.archived_at =
            now(). Auto-switches the active workspace for any
            profiles whose workspace_id pointed at this one — to
            their longest-membership non-archived workspace, OR
            NULL if they have no other memberships.

   Site-admin only.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  adminErrorResponse,
  createServiceSupabaseAdminClient,
  requireSiteAdmin,
} from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: Request,
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

  const { id: workspaceId } = await params;
  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const newName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!newName) {
    return NextResponse.json({ error: 'name required' }, { status: 400 });
  }

  const admin = createServiceSupabaseAdminClient();
  const { data: existing } = await admin
    .from('workspaces')
    .select('id, name')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  const oldName = (existing as { name: string }).name;

  const { error: updErr } = await admin
    .from('workspaces')
    .update({ name: newName })
    .eq('id', workspaceId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  await supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_user_id: actor.id,
    action: 'updated',
    entity_type: 'workspace',
    entity_id: workspaceId,
    field_changes: { name: { old: oldName, new: newName } },
  });

  return NextResponse.json({ ok: true });
}

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

  const { id: workspaceId } = await params;
  const admin = createServiceSupabaseAdminClient();

  const { data: existing } = await admin
    .from('workspaces')
    .select('id, name, archived_at')
    .eq('id', workspaceId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  if ((existing as { archived_at: string | null }).archived_at) {
    return NextResponse.json(
      { error: 'Workspace already archived' },
      { status: 409 },
    );
  }

  // 1. Archive the workspace.
  const archivedAt = new Date().toISOString();
  const { error: archErr } = await admin
    .from('workspaces')
    .update({ archived_at: archivedAt })
    .eq('id', workspaceId);
  if (archErr) {
    return NextResponse.json({ error: archErr.message }, { status: 500 });
  }

  // 2. Auto-switch any profiles whose active workspace was this
  // one. For each affected user: find their longest-membership
  // non-archived workspace; if none, NULL the active workspace.
  const { data: affectedProfiles } = await admin
    .from('profiles')
    .select('id')
    .eq('workspace_id', workspaceId);
  const affected = ((affectedProfiles ?? []) as Array<{ id: string }>).map(
    (p) => p.id,
  );

  let switchedCount = 0;
  for (const userId of affected) {
    // Longest membership = oldest workspace_members row in a
    // non-archived workspace.
    const { data: alt } = await admin
      .from('workspace_members')
      .select('workspace_id, created_at, workspaces!inner(archived_at)')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });
    const altList = (alt ?? []) as Array<{
      workspace_id: string;
      created_at: string;
      // Supabase nested-relation typing returns an array even
      // for the "to-one" side of a FK; treat as array and read [0].
      workspaces:
        | { archived_at: string | null }
        | Array<{ archived_at: string | null }>
        | null;
    }>;
    const fallback = altList.find((m) => {
      if (m.workspace_id === workspaceId) return false;
      const wsRel = Array.isArray(m.workspaces) ? m.workspaces[0] : m.workspaces;
      return wsRel != null && wsRel.archived_at === null;
    });
    await admin
      .from('profiles')
      .update({ workspace_id: fallback?.workspace_id ?? null })
      .eq('id', userId);
    if (fallback) switchedCount++;
  }

  await supabase.from('audit_log').insert({
    workspace_id: workspaceId,
    actor_user_id: actor.id,
    action: 'archived',
    entity_type: 'workspace',
    entity_id: workspaceId,
    field_changes: {
      archived_at: archivedAt,
      affected_profiles: affected.length,
      auto_switched: switchedCount,
      orphaned: affected.length - switchedCount,
    },
  });

  return NextResponse.json({
    ok: true,
    archived_at: archivedAt,
    affected_profiles: affected.length,
    auto_switched: switchedCount,
  });
}
