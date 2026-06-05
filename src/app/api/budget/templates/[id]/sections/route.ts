/* ============================================
   LOWPASS — Budget Template Sections API (Phase D editor)

   CRUD for budget_template_sections within a WORKSPACE-owned template.
   System presets (workspace_id NULL) are read-only — clone first.

   POST   { name, sort_order? }
   PATCH  { id, name?, sort_order? }
   DELETE ?id=uuid
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

type RouteCtx = { params: Promise<{ id: string }> };

/** Resolve workspace + assert the template is owned + editable. */
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
    .maybeSingle();
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

  let body: { name?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  let sortOrder = body.sort_order;
  if (sortOrder == null || !Number.isFinite(Number(sortOrder))) {
    const { data: maxRow } = await supabase
      .from('budget_template_sections')
      .select('sort_order')
      .eq('template_id', templateId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = Number(maxRow?.sort_order ?? -1) + 1;
  }

  const { data, error } = await supabase
    .from('budget_template_sections')
    .insert({
      template_id: templateId,
      workspace_id: workspaceId,
      name,
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

  let body: { id?: string; name?: string; sort_order?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const payload: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    payload.name = name;
  }
  if (body.sort_order !== undefined && Number.isFinite(Number(body.sort_order))) {
    payload.sort_order = Math.max(0, Math.floor(Number(body.sort_order)));
  }
  if (Object.keys(payload).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('budget_template_sections')
    .update(payload)
    .eq('id', body.id)
    .eq('template_id', templateId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Section not found' }, { status: 404 });
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
    .from('budget_template_sections')
    .delete()
    .eq('id', id)
    .eq('template_id', templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
