/* ============================================
   LOWPASS — Delete multiple workspace personnel rows

   POST JSON { ids: string[] } — workspace scoped.
   ============================================ */

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
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

  let body: { ids?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = body.ids;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'ids[] is required' }, { status: 400 });
  }

  const ids = raw.filter((id): id is string => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return NextResponse.json({ error: 'No valid ids' }, { status: 400 });

  const { data: removed, error } = await supabase
    .from('personnel')
    .delete()
    .in('id', ids)
    .eq('workspace_id', profile.workspace_id)
    .select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const deletedIds = (removed ?? []).map((r) => r.id as string);
  if (deletedIds.length === 0) {
    return NextResponse.json({ error: 'No matching roster rows were deleted' }, { status: 404 });
  }
  revalidatePath('/personnel');
  return NextResponse.json({ deleted: deletedIds.length, deleted_ids: deletedIds });
}
