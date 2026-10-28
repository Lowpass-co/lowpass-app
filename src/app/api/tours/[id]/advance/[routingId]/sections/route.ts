/* /api/tours/[id]/advance/[routingId]/sections — Customise this day.
   PUT  { sections, alsoTemplate?: boolean }  → the day's layout (marked customised);
        alsoTemplate also saves it as the template's layout.
   POST { action: 'reset' }                   → back to the template's layout.
   Answers are never touched: a section switched off keeps its answers in the
   stored JSON, so switching it back on brings them back. */

import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { ensureAdvance } from '@/server/advance/ensure';
import { asTemplateSections, cleanSections } from '@/server/advance/sections';
import { advanceError, readJson, tourGate } from '@/server/advance/routeGuard';
import { applyTemplateToDays, loadTemplateSet } from '@/server/advance/templates';

type Params = { params: Promise<{ id: string; routingId: string }> };

export async function PUT(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ sections?: unknown; alsoTemplate?: unknown }>(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const cleaned = cleanSections(body.sections);
  if ('error' in cleaned) return NextResponse.json({ error: cleaned.error }, { status: 400 });
  const client = supabase as unknown as SupabaseClient;
  try {
    const adv = await ensureAdvance(client, tourId, routingId, auth.user.id);
    const { data: cfg } = await client
      .from('advance_form_configs')
      .select('layout_template_id')
      .eq('id', adv.formConfigId)
      .maybeSingle<{ layout_template_id: string | null }>();
    const alsoTemplate = body.alsoTemplate === true && !!cfg?.layout_template_id;
    const { error } = await client
      .from('advance_form_configs')
      .update({ sections: cleaned.sections, customised: !alsoTemplate, updated_at: new Date().toISOString() })
      .eq('id', adv.formConfigId);
    if (error) throw new Error(error.message);
    if (alsoTemplate) {
      const { error: tErr } = await client
        .from('advance_layout_templates')
        .update({ sections: asTemplateSections(cleaned.sections), updated_at: new Date().toISOString() })
        .eq('id', cfg!.layout_template_id!)
        .eq('workspace_id', auth.workspaceId);
      if (tErr) throw new Error(tErr.message);
      const spread = await applyTemplateToDays(client, cfg!.layout_template_id!, { except: adv.formConfigId });
      return NextResponse.json({ sections: cleaned.sections, customised: false, templateDays: spread });
    }
    return NextResponse.json({ sections: cleaned.sections, customised: true });
  } catch (e) {
    return advanceError(e);
  }
}

export async function POST(request: Request, { params }: Params) {
  const { id: tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const auth = await requireWrite(supabase);
  if ('error' in auth) return auth.error;
  const gate = await tourGate(supabase, tourId, auth.workspaceId);
  if (gate) return gate;
  const body = await readJson<{ action?: unknown; templateId?: unknown }>(request);
  if (!body || (body.action !== 'reset' && body.action !== 'use-template')) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }
  const client = supabase as unknown as SupabaseClient;
  try {
    const adv = await ensureAdvance(client, tourId, routingId, auth.user.id);
    const set = await loadTemplateSet(client, auth.workspaceId);
    let templateId: string | null = null;
    if (body.action === 'use-template') {
      templateId = typeof body.templateId === 'string' ? body.templateId : null;
    } else {
      const { data: cfg } = await client
        .from('advance_form_configs')
        .select('layout_template_id')
        .eq('id', adv.formConfigId)
        .maybeSingle<{ layout_template_id: string | null }>();
      templateId = cfg?.layout_template_id ?? null;
    }
    const tpl = set.templates.find((t) => t.id === templateId);
    if (!tpl) return NextResponse.json({ error: 'That template no longer exists' }, { status: 404 });
    const sections = tpl.sections.map((s, i) => ({ ...s, order: i }));
    const { error } = await client
      .from('advance_form_configs')
      .update({ sections, layout_template_id: tpl.id, customised: false, updated_at: new Date().toISOString() })
      .eq('id', adv.formConfigId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ sections, template: { id: tpl.id, name: tpl.name } });
  } catch (e) {
    return advanceError(e);
  }
}
