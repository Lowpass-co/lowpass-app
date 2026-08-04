/* ============================================
   LOWPASS — Delete multiple personnel_rates for a tour

   POST JSON { tour_id: string, ids: string[] }
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  let body: { tour_id?: unknown; ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const tourId = typeof body.tour_id === 'string' ? body.tour_id : '';
  const raw = body.ids;
  if (!tourId || !Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'tour_id and ids[] are required' }, { status: 400 });
  }

  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });

  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .single();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  const { data: removed, error } = await supabase
    .from('personnel_rates')
    .delete()
    .in('id', ids)
    .eq('tour_id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deletedIds = (removed ?? []).map((r) => r.id as string);
  if (deletedIds.length === 0) {
    return NextResponse.json({ error: 'No matching tour personnel lines were removed' }, { status: 404 });
  }

  revalidatePath(`/tours/${tourId}/personnel`);
  return NextResponse.json({ deleted: deletedIds.length, deleted_ids: deletedIds });
}
