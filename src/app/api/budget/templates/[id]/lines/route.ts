/* ============================================
   LOWPASS — Budget Template Lines API (Phase D editor)

   CRUD for budget_template_lines within a WORKSPACE-owned template.
   System presets (workspace_id NULL) are read-only — clone first.

   POST   { template_section_id, label, default_phase_tag?, sort_order? }
   PATCH  { id, label?, default_phase_tag?, sort_order?, template_section_id? }
   DELETE ?id=uuid
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type RouteCtx = { params: Promise<{ id: string }> };
const PHASE_TAG_VALUES = ['pre_prod', 'rehearsals', 'show_days', 'wrap'];

async function guardTemplate(templateId: string) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workspace_id) {
    return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }
  const workspaceId = profile.workspace_id as string;
  const { data: template } = await supabase
    .from('budget_templates')
    .select('id, workspace_id, is_system')
    .eq('id', templateId)
    .maybeSingle();
  if (!template || template.workspace_id !== workspaceId || template.is_system) {
    return {
      error: NextResponse.json(
        { error: 'Template not found or not editable' },
        { status: 404 },
      ),
    };
  }
  return { supabase, workspaceId };
}

export async function POST(request: Request, ctx: RouteCtx) {
  const { id: templateId } = await ctx.params;
  const guard = await guardTemplate(templateId);
  if (guard.error) return guard.error;
  const { supabase, workspaceId } = guard;

  let body: {
    template_section_id?: string;
    label?: string;
    default_phase_tag?: string | null;
    sort_order?: number;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const label = (body.label ?? '').trim();
  if (!body.template_section_id || !label) {
    return NextResponse.json(
      { error: 'template_section_id and label are required' },
      { status: 400 },
    );
  }
  const phaseTag =
    body.default_phase_tag && PHASE_TAG_VALUES.includes(body.default_phase_tag)
      ? body.default_phase_tag
      : null;

  let sortOrder = body.sort_order;
  if (sortOrder == null || !Number.isFinite(Number(sortOrder))) {
    const { data: maxRow } = await supabase
      .from('budget_template_lines')
      .select('sort_order')
      .eq('template_section_id', body.template_section_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = Number(maxRow?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('budget_template_lines')
    .insert({
      template_id: templateId,
      template_section_id: body.template_section_id,
      workspace_id: workspaceId,
      label,
      default_phase_tag: phaseTag,
      sort_order: Math.max(0, Math.floor(Number(sortOrder))),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: Request, ctx: RouteCtx) {
  const { id: templateId } = await ctx.params;
  const guard = await guardTemplate(templateId);
  if (guard.error) return guard.error;
  const { supabase } = guard;

  let body: {
    id?: string;
    label?: string;
    default_phase_tag?: string | null;
    sort_order?: number;
    template_section_id?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const payload: Record<string, unknown> = {};
  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    payload.label = label;
  }
  if (body.default_phase_tag !== undefined) {
    payload.default_phase_tag =
      body.default_phase_tag && PHASE_TAG_VALUES.includes(body.default_phase_tag)
        ? body.default_phase_tag
        : null;
  }
  if (body.template_section_id !== undefined) {
    payload.template_section_id = body.template_section_id;
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    payload.sort_order = Math.max(0, Math.floor(Number(body.sort_order)));
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('budget_template_lines')
    .update(payload)
    .eq('id', body.id)
    .eq('template_id', templateId)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request, ctx: RouteCtx) {
  const { id: templateId } = await ctx.params;
  const guard = await guardTemplate(templateId);
  if (guard.error) return guard.error;
  const { supabase } = guard;

  const { searchParams } = new URL(request.url);
  let id = searchParams.get('id');
  if (!id) {
    try {
      const body = (await request.json()) as { id?: string };
      id = body.id ?? null;
    } catch {
      // no body
    }
  }
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase
    .from('budget_template_lines')
    .delete()
    .eq('id', id)
    .eq('template_id', templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
