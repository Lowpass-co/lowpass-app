/* /api/advance/template-set — the workspace's advance templates.
   GET  → { templates (with how many days use each), mapping (day type → template) }
   PUT  { mapping: { <dayType>: templateId | null } }  → which template each day type gets
   POST { name, sections?, copyOf? }                  → a new template */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireUserAndWorkspace, requireWrite } from '@/lib/auth/workspace-check';
import { loadTemplateSet } from '@/server/advance/templates';
import { asTemplateSections, cleanSections } from '@/server/advance/sections';
import { readJson } from '@/server/advance/routeGuard';

const DAY_TYPE = /^[a-z][a-z0-9 _-]{0,30}$/;

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const auth = await requireUserAndWorkspace(supabase);
  if ('error' in auth) return auth.error;
  const client = supabase as unknown as SupabaseClient;
  try {
    const set = await loadTemplateSet(client, auth.workspaceId);
    const ids = set.templates.map((t) => t.id);
    const { data: uses } = ids.length
      ? await client.from('advance_form_configs').select('layout_template_id, routing_id').in('layout_template_id', ids)
      : { data: [] };
    const count: Record<string, number> = {};
    for (const u of (uses ?? []) as { layout_template_id: string; routing_id: string | null }[]) {
      if (u.routing_id) count[u.layout_template_id] = (count[u.layout_template_id] ?? 0) + 1;
    }
    return NextResponse.json({
      templates: set.templates.map((t) => ({ ...t, days: count[t.id] ?? 0 })),
      mapping: set.mapping,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not load templates' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readJson<{ mapping?: unknown }>(request);
  if (!body?.mapping || typeof body.mapping !== 'object' || Array.isArray(body.mapping)) {
    return NextResponse.json({ error: 'mapping is required' }, { status: 400 });
  }
  const client = supabase as unknown as SupabaseClient;
  const set = await loadTemplateSet(client, auth.workspaceId);
  const ids = new Set(set.templates.map((t) => t.id));
  for (const [dayType, templateId] of Object.entries(body.mapping as Record<string, unknown>)) {
    const dt = dayType.trim().toLowerCase();
    if (!DAY_TYPE.test(dt)) return NextResponse.json({ error: `Bad day type ${dayType}` }, { status: 400 });
    if (templateId === null) {
      const { error } = await client.from('advance_day_type_templates').delete().eq('workspace_id', auth.workspaceId).eq('day_type', dt);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      continue;
    }
    if (typeof templateId !== 'string' || !ids.has(templateId)) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
    const { error } = await client
      .from('advance_day_type_templates')
      .upsert({ workspace_id: auth.workspaceId, day_type: dt, layout_template_id: templateId, updated_at: new Date().toISOString() }, { onConflict: 'workspace_id,day_type' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ mapping: (await loadTemplateSet(client, auth.workspaceId)).mapping });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readJson<{ name?: unknown; sections?: unknown; copyOf?: unknown }>(request);
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 80) : '';
  if (!name) return NextResponse.json({ error: 'Give the template a name' }, { status: 400 });
  const client = supabase as unknown as SupabaseClient;
  let sections: unknown = body?.sections ?? [];
  if (typeof body?.copyOf === 'string') {
    const set = await loadTemplateSet(client, auth.workspaceId);
    const src = set.templates.find((t) => t.id === body.copyOf);
    if (!src) return NextResponse.json({ error: 'Unknown template' }, { status: 400 });
    sections = src.sections;
  }
  const cleaned = cleanSections(sections);
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const { data, error } = await client
    .from('advance_layout_templates')
    .insert({ workspace_id: auth.workspaceId, name, sections: asTemplateSections(cleaned.sections) })
    .select('id, name, sections, updated_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: { ...data, days: 0 } }, { status: 201 });
}
