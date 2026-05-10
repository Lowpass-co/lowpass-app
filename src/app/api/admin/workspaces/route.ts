/* ============================================
   LOWPASS — /api/admin/workspaces (Sprint 9 §10)

   GET — paginated cross-workspace list. Calls list_all_workspaces
         RPC. Site-admin only. ?include_archived=true|false.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, requireSiteAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  archived_at: string | null;
  member_count: number;
  tour_count: number;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  try {
    await requireSiteAdmin(supabase);
  } catch (err) {
    const r = adminErrorResponse(err);
    return NextResponse.json({ error: r.message }, { status: r.status });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') ?? '';
  const includeArchived = searchParams.get('include_archived') === 'true';
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 50) || 50, 1),
    200,
  );
  const offset = Math.max(Number(searchParams.get('offset') ?? 0) || 0, 0);

  const { data, error } = await supabase.rpc('list_all_workspaces', {
    p_query: q || null,
    p_include_archived: includeArchived,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    const isAdminFail = error.code === 'P0003';
    return NextResponse.json(
      { error: error.message },
      { status: isAdminFail ? 403 : 500 },
    );
  }

  return NextResponse.json({ workspaces: (data ?? []) as WorkspaceRow[] });
}
