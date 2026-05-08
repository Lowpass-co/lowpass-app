/* ============================================
   LOWPASS — Workspaces / members (Sprint 9 §3)

   GET /api/workspaces/members
     Returns the active workspace's members + tags + grants +
     auth metadata. Calls the list_workspace_members SECURITY
     DEFINER RPC, which gates on admin role internally.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface MemberRow {
  member_id: string;
  user_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  role: 'admin' | 'manager' | 'readonly';
  is_workspace_owner: boolean;
  joined_at: string;
  last_sign_in_at: string | null;
  tags: string[];
  grants: Array<{
    resource_type: 'page' | 'product';
    resource_id: string;
    permission: 'read' | 'write';
  }>;
}

interface InviteRow {
  id: string;
  invited_email: string;
  invited_role: 'admin' | 'manager' | 'readonly';
  initial_tags: string[];
  initial_grants: unknown;
  invited_by_user_id: string | null;
  invited_by_name: string | null;
  expires_at: string;
  created_at: string;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve active workspace.
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  const workspaceId = (profile as { workspace_id?: string | null } | null)
    ?.workspace_id;
  if (!workspaceId) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }

  // Members via RPC. Returns empty for non-admins.
  const { data: members, error: memErr } = await supabase.rpc(
    'list_workspace_members',
    { p_workspace_id: workspaceId },
  );
  if (memErr) {
    return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  // Pending invites — admin-only RLS already gates this query.
  const { data: invites, error: invErr } = await supabase
    .from('workspace_invites')
    .select(
      'id, invited_email, invited_role, initial_tags, initial_grants, invited_by_user_id, expires_at, created_at',
    )
    .eq('workspace_id', workspaceId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (invErr) {
    return NextResponse.json({ error: invErr.message }, { status: 500 });
  }

  // Hydrate inviter names — small N, single batched query.
  const inviterIds = Array.from(
    new Set(
      (invites ?? [])
        .map((i: { invited_by_user_id: string | null }) => i.invited_by_user_id)
        .filter((v): v is string => !!v),
    ),
  );
  const nameById = new Map<string, string | null>();
  if (inviterIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', inviterIds);
    for (const p of (profiles ?? []) as Array<{ id: string; name: string | null }>) {
      nameById.set(p.id, p.name);
    }
  }

  const invitesOut: InviteRow[] = ((invites ?? []) as Array<{
    id: string;
    invited_email: string;
    invited_role: 'admin' | 'manager' | 'readonly';
    initial_tags: string[] | null;
    initial_grants: unknown;
    invited_by_user_id: string | null;
    expires_at: string;
    created_at: string;
  }>).map((i) => ({
    id: i.id,
    invited_email: i.invited_email,
    invited_role: i.invited_role,
    initial_tags: i.initial_tags ?? [],
    initial_grants: i.initial_grants ?? [],
    invited_by_user_id: i.invited_by_user_id,
    invited_by_name: i.invited_by_user_id
      ? nameById.get(i.invited_by_user_id) ?? null
      : null,
    expires_at: i.expires_at,
    created_at: i.created_at,
  }));

  return NextResponse.json({
    workspace_id: workspaceId,
    members: (members ?? []) as MemberRow[],
    invites: invitesOut,
  });
}
