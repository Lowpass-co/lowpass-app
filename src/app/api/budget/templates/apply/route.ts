/* ============================================
   LOWPASS — Apply budget template (Budget redesign Phase B)

   POST { tourId, templateId }

   Clones a template's sections → budget_sections and its lines →
   budget_line_items (proposed=0, actual=0, section_id set, category
   defaulted to 'misc', phase_tag from the template's default).

   The work is applyBudgetTemplate (src/server/budget/applyTemplate.ts),
   shared with tour creation: additive, re-runnable, never overwrites.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { applyBudgetTemplate, TemplateNotFound } from '@/server/budget/applyTemplate';

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }
  const workspaceId = profile.workspace_id as string;

  let body: { tourId?: string; templateId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { tourId, templateId } = body;
  if (!tourId || !templateId) {
    return NextResponse.json(
      { error: 'tourId and templateId are required' },
      { status: 400 },
    );
  }

  // Tour must belong to this workspace.
  const { data: tour } = await supabase
    .from('tours')
    .select('id')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  try {
    const out = await applyBudgetTemplate(supabase as unknown as SupabaseClient, { tourId, workspaceId, templateId });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    if (e instanceof TemplateNotFound) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not apply the template' }, { status: 500 });
  }
}
