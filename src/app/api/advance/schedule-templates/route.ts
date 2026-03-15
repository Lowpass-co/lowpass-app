/* ============================================
   LOWPASS — Advance Schedule templates

   GET: ?tourId= — list templates (user-wide + tour-wide when tourId given)
   POST: { name, scope, tourId?, sectionTemplateId, items } — save template
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  return profile?.workspace_id ?? null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ templates: [] });

  const { searchParams } = new URL(request.url);
  const tourId = searchParams.get('tourId')?.trim() ?? null;

  let query = supabase
    .from('advance_schedule_templates')
    .select('id, name, tour_id, section_template_id, items, created_at')
    .eq('workspace_id', workspaceId)
    .order('name');

  if (tourId) {
    query = query.or(`tour_id.is.null,tour_id.eq.${tourId}`);
  } else {
    query = query.is('tour_id', null);
  }

  const { data: rows, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const templates = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    scope: (r as { tour_id?: string | null }).tour_id ? 'tour' as const : 'user' as const,
    tour_id: (r as { tour_id?: string | null }).tour_id ?? null,
    section_template_id: r.section_template_id,
    items: r.items ?? {},
    created_at: r.created_at,
  }));

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; scope?: 'user' | 'tour'; tourId?: string; sectionTemplateId?: string; items?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  const scope = body.scope ?? 'user';
  const tourId = scope === 'tour' ? (body.tourId ?? '').trim() : null;
  const sectionTemplateId = (body.sectionTemplateId ?? '').trim();
  const items = body.items && typeof body.items === 'object' ? body.items : {};

  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  if (!sectionTemplateId) return NextResponse.json({ error: 'sectionTemplateId required' }, { status: 400 });

  const { data: row, error } = await supabase
    .from('advance_schedule_templates')
    .insert({
      workspace_id: workspaceId,
      tour_id: tourId || null,
      name,
      section_template_id: sectionTemplateId,
      items,
    })
    .select('id, name, tour_id, section_template_id, items, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const r = row as { id: string; name: string; tour_id?: string | null; section_template_id: string; items: Record<string, unknown>; created_at: string };
  return NextResponse.json({
    id: r.id,
    name: r.name,
    scope: r.tour_id ? 'tour' : 'user',
    section_template_id: r.section_template_id,
    items: r.items ?? {},
    created_at: r.created_at,
  });
}
