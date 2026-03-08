/* ============================================
   LOWPASS — Advance Layout Templates (workspace)

   GET: List saved layout templates for this workspace
   POST: Create a new layout template
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Section = { template_id: string; label: string; fields: unknown[]; order: number };

async function getWorkspaceTourIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) return null;
  const { data: tours } = await supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id);
  return (tours ?? []).map((t) => t.id);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const tourIds = await getWorkspaceTourIds(supabase);
  if (!tourIds?.length) {
    return NextResponse.json({ templates: [] });
  }

  const { data: configs, error } = await supabase
    .from('advance_form_configs')
    .select('id, template_label, name, sections')
    .in('tour_id', tourIds)
    .eq('is_template', true)
    .order('template_label');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const templates = (configs ?? []).map((c) => ({
    id: c.id,
    name: c.template_label ?? c.name ?? 'Untitled',
    sections: (c.sections as Section[]) ?? [],
  }));

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { template_label: string; sections: Section[]; tour_id: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const template_label = typeof body.template_label === 'string' ? body.template_label.trim() : '';
  const sections = Array.isArray(body.sections) ? body.sections : [];
  const tour_id = body.tour_id;
  if (!template_label || !tour_id) {
    return NextResponse.json({ error: 'template_label and tour_id are required' }, { status: 400 });
  }

  const tourIds = await getWorkspaceTourIds(supabase);
  if (!tourIds?.includes(tour_id)) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const normalizedSections = sections.map((s) => ({
    template_id: s.template_id ?? '',
    label: s.label ?? '',
    fields: Array.isArray(s.fields) ? s.fields : [],
    order: typeof s.order === 'number' ? s.order : 0,
  }));

  const { data: created, error } = await supabase
    .from('advance_form_configs')
    .insert({
      tour_id,
      routing_id: null,
      name: template_label,
      template_label,
      is_template: true,
      is_default: false,
      sections: normalizedSections,
      created_by_id: user.id,
    })
    .select('id, template_label, sections')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    id: created.id,
    name: created.template_label,
    sections: created.sections ?? [],
  });
}
