/* ============================================
   LOWPASS — Rider/Pack resolved view

   GET /api/rider-packs/[id]/resolved
     Returns { pack, sections } where sections are merged
     across the scope chain (show > tour > artist) with
     inheritance metadata on each.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatResolveError, resolvePack } from '@/lib/rider-packs/resolve';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const { data: pack, error } = await supabase
    .from('rider_packs')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!pack) {
    return NextResponse.json({ error: 'Pack not found' }, { status: 404 });
  }

  try {
    const resolved = await resolvePack(supabase, pack);
    return NextResponse.json(resolved);
  } catch (err) {
    return NextResponse.json({ error: formatResolveError(err) }, { status: 500 });
  }
}
