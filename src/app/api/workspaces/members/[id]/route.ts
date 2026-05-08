/* ============================================
   LOWPASS — Workspaces / members / [id] (Sprint 9 §3)

   PATCH /api/workspaces/members/[id]
     Body: { role, tags, grants }. Atomically updates role,
     replaces tag set, replaces user-direct grants. Admin-only;
     gating is enforced inside update_workspace_member RPC.

   DELETE /api/workspaces/members/[id]
     Removes the membership row (cascades tags + user-direct
     grants via FK). Admin-only via workspace_members RLS.
     Cannot remove the workspace owner — protected here at the
     route layer. Cannot remove yourself — also protected here
     (admins lock themselves out otherwise).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { validateGrant, type GrantInput } from '@/lib/permissions/resources';

export const dynamic = 'force-dynamic';

type Role = 'admin' | 'manager' | 'readonly';

function isRole(v: unknown): v is Role {
  return v === 'admin' || v === 'manager' || v === 'readonly';
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ error: 'member id required' }, { status: 400 });
  }

  let body: { role?: unknown; tags?: unknown; grants?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!isRole(body.role)) {
    return NextResponse.json({ error: 'role must be admin|manager|readonly' }, { status: 400 });
  }
  if (
    body.tags != null &&
    (!Array.isArray(body.tags) || !body.tags.every((t) => typeof t === 'string' && t.length > 0))
  ) {
    return NextResponse.json({ error: 'tags must be string[]' }, { status: 400 });
  }
  if (body.grants != null && !Array.isArray(body.grants)) {
    return NextResponse.json({ error: 'grants must be an array' }, { status: 400 });
  }

  const grants = (body.grants ?? []) as unknown[];
  for (const g of grants) {
    const err = validateGrant(g);
    if (err) {
      return NextResponse.json({ error: `Invalid grant: ${err}` }, { status: 400 });
    }
  }

  // Dedupe tags + grants client-side noise.
  const tags = Array.from(new Set((body.tags ?? []) as string[])).map((t) =>
    t.trim(),
  ).filter((t) => t.length > 0);
  const grantsTyped = (grants as GrantInput[]).map((g) => ({
    resource_type: g.resource_type,
    resource_id: g.resource_id,
    permission: g.permission,
  }));

  const { error: rpcErr } = await supabase.rpc('update_workspace_member', {
    p_member_id: memberId,
    p_new_role: body.role,
    p_new_tags: tags,
    p_new_grants: grantsTyped,
  });

  if (rpcErr) {
    // Map known RPC errors to HTTP status codes.
    const code = rpcErr.code;
    const status =
      code === 'P0001'
        ? 401
        : code === 'P0002'
          ? 404
          : code === 'P0003'
            ? 403
            : code === 'P0004'
              ? 400
              : 500;
    return NextResponse.json({ error: rpcErr.message }, { status });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ error: 'member id required' }, { status: 400 });
  }

  // Look up the member to enforce two route-level guards beyond
  // RLS: cannot remove workspace owner; cannot remove yourself.
  const { data: target } = await supabase
    .from('workspace_members')
    .select('id, user_id, workspace_id, is_workspace_owner')
    .eq('id', memberId)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: 'Member not found' }, { status: 404 });
  }

  const t = target as {
    id: string;
    user_id: string;
    workspace_id: string;
    is_workspace_owner: boolean;
  };

  if (t.is_workspace_owner) {
    return NextResponse.json(
      { error: 'Cannot remove the workspace owner' },
      { status: 403 },
    );
  }
  if (t.user_id === user.id) {
    return NextResponse.json(
      { error: 'Cannot remove yourself' },
      { status: 403 },
    );
  }

  const { error: delErr } = await supabase
    .from('workspace_members')
    .delete()
    .eq('id', memberId);

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  // Clean up user-direct permission_grants for this user in this
  // workspace (FK cascades on workspace_members deletion only
  // cover workspace_member_tags, not permission_grants — grants
  // are keyed on subject_id::text not member_id).
  await supabase
    .from('permission_grants')
    .delete()
    .eq('workspace_id', t.workspace_id)
    .eq('subject_type', 'user')
    .eq('subject_id', t.user_id);

  // Audit log
  await supabase.from('audit_log').insert({
    workspace_id: t.workspace_id,
    actor_user_id: user.id,
    action: 'deleted',
    entity_type: 'workspace_member',
    entity_id: memberId,
    field_changes: { removed_user_id: t.user_id },
  });

  return NextResponse.json({ ok: true });
}
