/* ============================================
   LOWPASS — Labor call templates API (P6)

   GET   ?tour_id=uuid  → templates applicable to that tour: its own tour-scoped
                          templates PLUS the tour's artist-scoped ones (artist
                          inherits to tours, like budget templates).
   POST  { tour_id | artist_id, name, rows } → save a template.

   Workspace-scoped. Not payroll.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { LaborCallRow } from '@/lib/labor-calls/types';

async function ctx() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { supabase, workspaceId: profile.workspace_id as string, userId: user.id };
}

export async function GET(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tour_id');
  if (!tourId) return NextResponse.json({ error: 'tour_id is required' }, { status: 400 });

  // Resolve the tour's artist so artist-scoped templates inherit to it.
  const { data: tour } = await c.supabase
    .from('tours')
    .select('id, artist_id')
    .eq('id', tourId)
    .eq('workspace_id', c.workspaceId)
    .maybeSingle<{ id: string; artist_id: string | null }>();
  if (!tour) return NextResponse.json({ error: 'Tour not found' }, { status: 404 });

  const ors = [`tour_id.eq.${tourId}`];
  if (tour.artist_id) ors.push(`artist_id.eq.${tour.artist_id}`);
  const { data, error } = await c.supabase
    .from('labor_call_templates')
    .select('*')
    .eq('workspace_id', c.workspaceId)
    .or(ors.join(','))
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const auth = await requireWrite(c.supabase);
  if ('error' in auth) return auth.error;
  let body: { tour_id?: string | null; artist_id?: string | null; name?: string; rows?: LaborCallRow[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.tour_id && !body.artist_id) {
    return NextResponse.json({ error: 'tour_id or artist_id is required' }, { status: 400 });
  }
  const { data, error } = await c.supabase
    .from('labor_call_templates')
    .insert({
      workspace_id: c.workspaceId,
      tour_id: body.tour_id ?? null,
      artist_id: body.artist_id ?? null,
      name: (body.name ?? '').trim() || 'Labor call template',
      rows: Array.isArray(body.rows) ? body.rows : [],
      created_by: c.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data }, { status: 201 });
}
