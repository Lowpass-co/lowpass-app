/* ============================================
   LOWPASS — /api/tours/[id]/personnel/search (Sprint 9 §6)

   GET ?q=<query>&exclude=<csv-of-already-assigned-person-ids>

   Returns persons in the tour's workspace that match the search
   query (full_name / preferred_name / email ILIKE) and are not
   in the exclude list. Used by the "+ Add personnel" slide-over
   to pick existing persons. Up to 20 results.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

interface SearchHit {
  id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tourId } = await params;

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  const grants = await fetchActiveGrants(supabase, membership, user.id);
  if (!canAccess(membership, grants, 'page', 'operations.personnel', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  const exclude = (searchParams.get('exclude') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Tour's workspace (defense in depth — RLS gates this anyway).
  const { data: tour } = await supabase
    .from('tours')
    .select('workspace_id')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const workspaceId = (tour as { workspace_id: string }).workspace_id;

  let query = supabase
    .from('persons')
    .select('id, full_name, preferred_name, email, phone')
    .eq('workspace_id', workspaceId)
    .order('full_name', { ascending: true })
    .limit(20);

  if (q) {
    // Escape % and _ for LIKE; trust the .or builder beyond that.
    const pattern = `%${q.replace(/[%_]/g, '\\$&')}%`;
    query = query.or(
      `full_name.ilike.${pattern},preferred_name.ilike.${pattern},email.ilike.${pattern}`,
    );
  }

  if (exclude.length > 0) {
    query = query.not('id', 'in', `(${exclude.map((id) => `"${id}"`).join(',')})`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hits: SearchHit[] = ((data ?? []) as Array<{
    id: string;
    full_name: string;
    preferred_name: string | null;
    email: string | null;
    phone: string | null;
  }>).map((p) => ({
    id: p.id,
    display_name: p.preferred_name?.trim() || p.full_name?.trim() || 'Unknown',
    email: p.email,
    phone: p.phone,
  }));

  return NextResponse.json({ persons: hits });
}
