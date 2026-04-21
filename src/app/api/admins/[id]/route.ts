/* ============================================
   LOWPASS — Site admins API (item)

   DELETE: demote a user from site admin by id.
           Requires the caller to be a site admin.
           The underlying SQL function blocks self-demotion and
           demoting the last remaining admin.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUserAndAdminStatus } from '@/lib/site-admin';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, isAdmin } = await getUserAndAdminStatus();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'Id is required' }, { status: 400 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .rpc('demote_site_admin', { target_id: id })
    .single();

  if (error) {
    const status = error.code === 'P0002' ? 404 : error.code === '42501' ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ admin: data });
}
