/* ============================================
   LOWPASS — /api/admin/users/[id]/memberships (Sprint 9 §10)

   GET — list every workspace_members row for a target user,
         joined to workspace name + tags + archived flag.
         Calls list_user_memberships RPC. Site-admin only.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, requireSiteAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface MembershipRow {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  role: 'admin' | 'manager' | 'readonly';
  is_workspace_owner: boolean;
  joined_at: string;
  tags: string[];
  workspace_archived: boolean;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { id: targetUserId } = await params;
  if (!targetUserId) {
    return NextResponse.json({ error: 'user id required' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('list_user_memberships', {
    p_user_id: targetUserId,
  });
  if (error) {
    const isAdminFail = error.code === 'P0003';
    return NextResponse.json(
      { error: error.message },
      { status: isAdminFail ? 403 : 500 },
    );
  }

  return NextResponse.json({ memberships: (data ?? []) as MembershipRow[] });
}
