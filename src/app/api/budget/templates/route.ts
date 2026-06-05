/* ============================================
   LOWPASS — Budget Templates API (Budget redesign Phase B/D)

   GET    ?id=uuid            — one template, hydrated with sections+lines
   GET    ?artist_id=uuid?    — list system + workspace templates
                                (sections hydrated for preview; lines omitted)
   POST   { name, ... }       — create a workspace template, optionally
                                cloned from an existing template via clone_from
   PATCH  { id, ... }         — rename / re-describe a WORKSPACE template
   DELETE ?id=uuid            — delete a WORKSPACE template (cascades)

   System presets (workspace_id NULL, is_system) are read-only: writes
   are rejected unless the template belongs to the caller's workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function resolveWorkspace() {
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
  return { supabase, workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (id) {
    // Single template, fully hydrated (sections + lines) for the editor.
    const { data: template, error } = await supabase
      .from('budget_templates')
      .select('*')
      .eq('id', id)
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }
    const [sectionsRes, linesRes] = await Promise.all([
      supabase
        .from('budget_template_sections')
        .select('*')
        .eq('template_id', id)
        .order('sort_order', { ascending: true }),
      supabase
        .from('budget_template_lines')
        .select('*')
        .eq('template_id', id)
        .order('sort_order', { ascending: true }),
    ]);
    const lines = linesRes.data ?? [];
    const sections = (sectionsRes.data ?? []).map((s) => ({
      ...s,
      lines: lines.filter((l) => l.template_section_id === s.id),
    }));
    return NextResponse.json({ template: { ...template, sections } });
  }

  // List: system presets + this workspace's templates. Sections hydrated
  // (names only used for preview); lines omitted to keep the payload lean.
  const { data: templates, error } = await supabase
    .from('budget_templates')
    .select('*')
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order('is_system', { ascending: false })
    .order('tier', { ascending: true })
    .order('name', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const ids = (templates ?? []).map((t) => t.id);
  let sectionsByTemplate: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: sections } = await supabase
      .from('budget_template_sections')
      .select('id, template_id, name, sort_order')
      .in('template_id', ids)
      .order('sort_order', { ascending: true });
    sectionsByTemplate = (sections ?? []).reduce<Record<string, unknown[]>>(
      (acc, s) => {
        (acc[s.template_id] ??= []).push(s);
        return acc;
      },
      {},
    );
  }
  const hydrated = (templates ?? []).map((t) => ({
    ...t,
    sections: sectionsByTemplate[t.id] ?? [],
  }));
  return NextResponse.json({ templates: hydrated });
}

export async function POST(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  let body: {
    name?: string;
    description?: string | null;
    tier?: string | null;
    artist_id?: string | null;
    is_default?: boolean;
    /** When set, deep-copy that template's sections + lines into the
     *  new workspace template (clone a system preset to customise). */
    clone_from?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const name = (body.name ?? '').trim();
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const { data: created, error } = await supabase
    .from('budget_templates')
    .insert({
      workspace_id: workspaceId,
      artist_id: body.artist_id ?? null,
      name,
      description: body.description ?? null,
      tier: body.tier ?? null,
      is_system: false,
      is_default: Boolean(body.is_default),
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Optional deep clone of a source template's structure.
  if (body.clone_from) {
    const [srcSections, srcLines] = await Promise.all([
      supabase
        .from('budget_template_sections')
        .select('*')
        .eq('template_id', body.clone_from)
        .order('sort_order', { ascending: true }),
      supabase
        .from('budget_template_lines')
        .select('*')
        .eq('template_id', body.clone_from)
        .order('sort_order', { ascending: true }),
    ]);
    const sectionIdMap = new Map<string, string>();
    for (const s of srcSections.data ?? []) {
      const { data: newSection } = await supabase
        .from('budget_template_sections')
        .insert({
          template_id: created.id,
          workspace_id: workspaceId,
          name: s.name,
          sort_order: s.sort_order,
        })
        .select('id')
        .single();
      if (newSection) sectionIdMap.set(s.id, newSection.id);
    }
    const lineRows = (srcLines.data ?? [])
      .map((l) => {
        const newSectionId = sectionIdMap.get(l.template_section_id);
        if (!newSectionId) return null;
        return {
          template_id: created.id,
          template_section_id: newSectionId,
          workspace_id: workspaceId,
          label: l.label,
          default_phase_tag: l.default_phase_tag ?? null,
          sort_order: l.sort_order,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (lineRows.length > 0) {
      await supabase.from('budget_template_lines').insert(lineRows);
    }
  }

  return NextResponse.json(created);
}

export async function PATCH(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

  let body: {
    id?: string;
    name?: string;
    description?: string | null;
    tier?: string | null;
    artist_id?: string | null;
    is_default?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    payload.name = name;
  }
  if (body.description !== undefined) payload.description = body.description;
  if (body.tier !== undefined) payload.tier = body.tier;
  if (body.artist_id !== undefined) payload.artist_id = body.artist_id;
  if (body.is_default !== undefined) payload.is_default = Boolean(body.is_default);

  // Workspace filter prevents editing system presets (workspace_id NULL).
  const { data, error } = await supabase
    .from('budget_templates')
    .update(payload)
    .eq('id', body.id)
    .eq('workspace_id', workspaceId)
    .select()
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'Template not found or not editable' },
      { status: 404 },
    );
  }
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const ctx = await resolveWorkspace();
  if (ctx.error) return ctx.error;
  const { supabase, workspaceId } = ctx;

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
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }

  // Workspace filter prevents deleting system presets.
  const { error } = await supabase
    .from('budget_templates')
    .delete()
    .eq('id', id)
    .eq('workspace_id', workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new Response(null, { status: 204 });
}
