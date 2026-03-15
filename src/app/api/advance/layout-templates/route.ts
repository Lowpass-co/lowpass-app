/* ============================================
   LOWPASS — Advance Layout Templates (workspace)

   GET: List saved layout templates for this workspace
   POST: Create a new layout template
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type Section = { template_id: string; label: string; fields: unknown[]; order: number };

async function getWorkspaceId(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  return profile?.workspace_id ?? null;
}

async function getWorkspaceTourIds(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>) {
  const workspaceId = await getWorkspaceId(supabase);
  if (!workspaceId) return null;
  const { data: tours } = await supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', workspaceId);
  return (tours ?? []).map((t) => t.id);
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const workspaceId = await getWorkspaceId(supabase);
  const tourIds = await getWorkspaceTourIds(supabase);

  const templates: { id: string; name: string; sections: Section[] }[] = [];

  if (tourIds?.length) {
    const { data: configs, error } = await supabase
      .from('advance_form_configs')
      .select('id, template_label, name, sections')
      .in('tour_id', tourIds)
      .eq('is_template', true)
      .order('template_label');

    if (!error && configs) {
      templates.push(...configs.map((c) => ({
        id: c.id,
        name: c.template_label ?? c.name ?? 'Untitled',
        sections: (c.sections as Section[]) ?? [],
      })));
    }
  }

  if (workspaceId) {
    const { data: workspaceLayouts, error: layoutErr } = await supabase
      .from('advance_layout_templates')
      .select('id, name, sections')
      .eq('workspace_id', workspaceId)
      .order('name');

    if (!layoutErr && workspaceLayouts) {
      templates.push(...workspaceLayouts.map((r) => ({
        id: r.id,
        name: r.name ?? 'Untitled',
        sections: (r.sections as Section[]) ?? [],
      })));
    }
  }

  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { template_label: string; sections: Section[]; tour_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const template_label = typeof body.template_label === 'string' ? body.template_label.trim() : '';
  const sections = Array.isArray(body.sections) ? body.sections : [];
  if (!template_label) {
    return NextResponse.json({ error: 'template_label is required' }, { status: 400 });
  }

  const normalizedSections = sections.map((s) => ({
    template_id: s.template_id ?? '',
    label: s.label ?? '',
    fields: Array.isArray(s.fields) ? s.fields : [],
    order: typeof s.order === 'number' ? s.order : 0,
  }));

  const tour_id = body.tour_id;

  // Workspace-scoped save (no tour): works when advance not yet saved
  if (!tour_id) {
    const workspaceId = await getWorkspaceId(supabase);
    if (!workspaceId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data: created, error } = await supabase
      .from('advance_layout_templates')
      .insert({
        workspace_id: workspaceId,
        name: template_label,
        sections: normalizedSections,
      })
      .select('id, name, sections')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      id: created.id,
      name: created.name,
      sections: created.sections ?? [],
    });
  }

  const tourIds = await getWorkspaceTourIds(supabase);
  if (!tourIds?.includes(tour_id)) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

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
