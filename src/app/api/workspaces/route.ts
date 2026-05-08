/* ============================================
   LOWPASS — Workspaces (Sprint 9 §3)

   GET /api/workspaces
     Returns the workspaces the caller is a member of, plus
     their role + member count + active flag. Used by
     <WorkspaceSwitcher> to populate the dropdown.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface WorkspaceListItem {
  id: string;
  name: string;
  role: 'admin' | 'manager' | 'readonly';
  is_workspace_owner: boolean;
  member_count: number;
  is_active: boolean;
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  const activeWorkspaceId =
    (profile as { workspace_id?: string | null } | null)?.workspace_id ?? null;

  // workspace_members SELECT RLS is self-only — this returns
  // only rows for the calling user. Each row's workspace_id is
  // a workspace the caller is a member of.
  const { data: memberships, error } = await supabase
    .from('workspace_members')
    .select('id, workspace_id, role, is_workspace_owner')
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (memberships ?? []) as Array<{
    id: string;
    workspace_id: string;
    role: 'admin' | 'manager' | 'readonly';
    is_workspace_owner: boolean;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ workspaces: [] });
  }

  const ids = rows.map((r) => r.workspace_id);
  const { data: wsRows } = await supabase
    .from('workspaces')
    .select('id, name')
    .in('id', ids);

  const nameById = new Map<string, string>();
  for (const w of (wsRows ?? []) as Array<{ id: string; name: string }>) {
    nameById.set(w.id, w.name);
  }

  // Member counts. Admins see the real count (workspace_members
  // RLS returns only their own row otherwise). Use a SECURITY
  // DEFINER aggregate? For Sprint 9 v1, surface a "—" for
  // non-admin viewers; admins get the real count via a separate
  // call to list_workspace_members. Cheaper compromise: count
  // unique user_ids visible in the caller's own workspace_members
  // SELECT — this returns 1 for the current user's row only,
  // which is misleading. Keep member_count nullable and let the
  // UI show the count only for the active workspace where the
  // /api/workspaces/members endpoint already returns full data.
  // For non-active workspaces the dropdown shows "Member" with
  // no count.

  const items: WorkspaceListItem[] = rows
    .map((r) => ({
      id: r.workspace_id,
      name: nameById.get(r.workspace_id) ?? '(unknown)',
      role: r.role,
      is_workspace_owner: r.is_workspace_owner,
      member_count: 0, // placeholder — UI hides when 0 if not active
      is_active: r.workspace_id === activeWorkspaceId,
    }))
    .sort((a, b) => {
      if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return NextResponse.json({ workspaces: items });
}
