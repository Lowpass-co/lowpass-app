/* /api/advance/template-set/[templateId]
   PATCH  { name?, sections? }  → rename / change the layout; a layout change
          reaches the days that follow the template (not customised, not yet
          sent to a venue). Returns how many moved and how many kept theirs.
   DELETE → removes the template; days made from it keep their questions. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { applyTemplateToDays } from '@/server/advance/templates';
import { asTemplateSections, cleanSections } from '@/server/advance/sections';
import { readJson } from '@/server/advance/routeGuard';

type Params = { params: Promise<{ templateId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const body = await readJson<{ name?: unknown; sections?: unknown }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
    if (!name) return NextResponse.json({ error: 'Give the template a name' }, { status: 400 });
    patch.name = name;
  }
  if (body.sections !== undefined) {
    const cleaned = cleanSections(body.sections);
    if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
    patch.sections = asTemplateSections(cleaned.sections);
  }
  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client
    .from('advance_layout_templates')
    .update(patch)
    .eq('id', templateId)
    .eq('workspace_id', auth.workspaceId)
    .select('id, name, sections, updated_at');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  let days = { updated: 0, kept: 0 };
  if (patch.sections) {
    try {
      days = await applyTemplateToDays(client, templateId);
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : 'Saved, but days were not updated' }, { status: 500 });
    }
  }
  return NextResponse.json({ template: data[0], days });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { templateId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const { data, error } = await (supabase as unknown as SupabaseClient)
    .from('advance_layout_templates')
    .delete()
    .eq('id', templateId)
    .eq('workspace_id', auth.workspaceId)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
