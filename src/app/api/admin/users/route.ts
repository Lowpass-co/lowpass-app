/* ============================================
   LOWPASS — /api/admin/users (Sprint 9 §10)

   GET — paginated cross-workspace user list. Calls
         list_all_users RPC. Site-admin only.

   Query params:
     ?q=<search>          (matches email + name)
     ?status=all|active|suspended
     ?limit=<int>         (capped to 200 in the RPC)
     ?offset=<int>
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { adminErrorResponse, requireSiteAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  is_site_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  workspace_count: number;
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
  const status = searchParams.get('status') ?? 'all';
  const limit = Math.min(
    Math.max(Number(searchParams.get('limit') ?? 50) || 50, 1),
    200,
  );
  const offset = Math.max(Number(searchParams.get('offset') ?? 0) || 0, 0);

  if (status !== 'all' && status !== 'active' && status !== 'suspended') {
    return NextResponse.json(
      { error: 'status must be all|active|suspended' },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.rpc('list_all_users', {
    p_query: q || null,
    p_status: status,
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

  return NextResponse.json({ users: (data ?? []) as UserRow[] });
}
