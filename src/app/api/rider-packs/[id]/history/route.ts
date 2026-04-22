/* ============================================
   LOWPASS — Rider/Pack audit history

   GET /api/rider-packs/[id]/history?limit=50&before=<iso>
     Paginated, most-recent-first.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

const MAX_LIMIT = 200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { searchParams } = new URL(request.url);
  const limitParam = searchParams.get('limit');
  const before = searchParams.get('before');

  let limit = Number(limitParam ?? 50);
  if (!Number.isFinite(limit) || limit <= 0) limit = 50;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  let query = supabase
    .from('rider_pack_history')
    .select('*')
    .eq('pack_id', id)
    .order('changed_at', { ascending: false })
    .limit(limit);
  if (before) {
    query = query.lt('changed_at', before);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ history: data ?? [], limit });
}
