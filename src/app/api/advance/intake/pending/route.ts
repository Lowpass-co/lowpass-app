/* ============================================
   LOWPASS — Intake pending answers · TM review + apply (P7 · Q7)

   GET  ?advance_instance_id=uuid → pending answers for the TM's Review queue,
        with the current value per field (oldValue) + field/section labels.
   POST { advance_instance_id, accept: [id…], reject: [id…] } → the APPLY GATE:
        accepted normal fields run through mergeIntakeIntoAdvance (never-clobber)
        into advance_instances.data; accepted LABOR-call fields apply additively
        to the labor_calls table (P6); rows are marked accepted/rejected.

   Authenticated + workspace-scoped (RLS + explicit filter).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { buildIntakeFormSchema, mergeIntakeIntoAdvance, type IntakeSection, type AdvanceData } from '@/lib/advance/intake';
import { pendingToAdvanceData, LABOR_CALL_FIELD_TYPE } from '@/lib/advance/intake-pending';
import { applyRowsToDay } from '@/lib/labor-calls/server';
import type { LaborCallRow } from '@/lib/labor-calls/types';

interface PendingRow {
  id: string;
  advance_instance_id: string;
  section_id: string;
  field_id: string;
  value: unknown;
  source: string;
  provenance: string | null;
  status: string;
}

async function ctx() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { supabase, workspaceId: profile.workspace_id as string, userId: user.id };
}

/** field_id → type + labels, from the instance's section templates. */
function fieldMeta(sections: IntakeSection[] | null) {
  const schema = buildIntakeFormSchema(sections);
  const typeByField = new Map<string, string>();
  const labelByField = new Map<string, string>();
  const sectionLabel = new Map<string, string>();
  for (const s of schema.sections) {
    sectionLabel.set(s.template_id, s.label);
    for (const f of s.fields) {
      typeByField.set(`${s.template_id}:${f.id}`, f.type);
      labelByField.set(`${s.template_id}:${f.id}`, f.label);
    }
  }
  return { typeByField, labelByField, sectionLabel };
}

export async function GET(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const instanceId = new URL(request.url).searchParams.get('advance_instance_id');
  if (!instanceId) return NextResponse.json({ error: 'advance_instance_id is required' }, { status: 400 });

  const { data: instance } = await c.supabase
    .from('advance_instances')
    .select('id, sections, data')
    .eq('id', instanceId)
    .maybeSingle<{ id: string; sections: IntakeSection[] | null; data: AdvanceData | null }>();
  if (!instance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 });

  const { data: pending } = await c.supabase
    .from('intake_pending_answers')
    .select('id, advance_instance_id, section_id, field_id, value, source, provenance, status')
    .eq('workspace_id', c.workspaceId)
    .eq('advance_instance_id', instanceId)
    .eq('status', 'pending');

  const meta = fieldMeta(instance.sections);
  const rows = (pending ?? []).map((p: PendingRow) => {
    const key = `${p.section_id}:${p.field_id}`;
    return {
      id: p.id,
      section_id: p.section_id,
      field_id: p.field_id,
      label: meta.labelByField.get(key) ?? p.field_id,
      sectionLabel: meta.sectionLabel.get(p.section_id) ?? p.section_id,
      type: meta.typeByField.get(key) ?? 'text',
      value: p.value,
      oldValue: instance.data?.[p.section_id]?.[p.field_id] ?? null,
      source: p.source,
      provenance: p.provenance,
    };
  });
  return NextResponse.json({ pending: rows });
}

export async function POST(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const auth = await requireWrite(c.supabase);
  if ('error' in auth) return auth.error;
  let body: { advance_instance_id?: string; accept?: string[]; reject?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const instanceId = body.advance_instance_id;
  if (!instanceId) return NextResponse.json({ error: 'advance_instance_id is required' }, { status: 400 });
  const acceptIds = Array.isArray(body.accept) ? body.accept : [];
  const rejectIds = Array.isArray(body.reject) ? body.reject : [];

  const { data: instance } = await c.supabase
    .from('advance_instances')
    .select('id, routing_id, sections, data')
    .eq('id', instanceId)
    .maybeSingle<{ id: string; routing_id: string | null; sections: IntakeSection[] | null; data: AdvanceData | null }>();
  if (!instance) return NextResponse.json({ error: 'Advance not found' }, { status: 404 });

  // Load the accepted pending rows (workspace-scoped).
  const { data: accepted } = acceptIds.length
    ? await c.supabase
        .from('intake_pending_answers')
        .select('id, section_id, field_id, value')
        .eq('workspace_id', c.workspaceId)
        .eq('advance_instance_id', instanceId)
        .in('id', acceptIds)
    : { data: [] as { id: string; section_id: string; field_id: string; value: unknown }[] };

  const meta = fieldMeta(instance.sections);
  const normal: { section_id: string; field_id: string; value: unknown }[] = [];
  const laborRows: LaborCallRow[] = [];
  for (const a of accepted ?? []) {
    const type = meta.typeByField.get(`${a.section_id}:${a.field_id}`);
    if (type === LABOR_CALL_FIELD_TYPE) {
      if (Array.isArray(a.value)) laborRows.push(...(a.value as LaborCallRow[]));
    } else {
      normal.push(a);
    }
  }

  // Normal fields → the SAME never-clobber merge, now at accept-time.
  if (normal.length > 0) {
    const merged = mergeIntakeIntoAdvance(instance.data, pendingToAdvanceData(normal));
    await c.supabase
      .from('advance_instances')
      .update({ data: merged, last_updated_at: new Date().toISOString() })
      .eq('id', instanceId);
  }

  // Labor-call fields → the P6 additive/never-clobber apply to labor_calls.
  if (laborRows.length > 0 && instance.routing_id) {
    let tourId: string | null = null;
    const { data: r } = await c.supabase.from('routing').select('tour_id').eq('id', instance.routing_id).maybeSingle<{ tour_id: string | null }>();
    tourId = r?.tour_id ?? null;
    await applyRowsToDay(c.supabase, { workspaceId: c.workspaceId, tourId, routingId: instance.routing_id }, laborRows);
  }

  const nowIso = new Date().toISOString();
  if (acceptIds.length) {
    await c.supabase
      .from('intake_pending_answers')
      .update({ status: 'accepted', reviewed_at: nowIso, reviewed_by: c.userId })
      .eq('workspace_id', c.workspaceId)
      .in('id', acceptIds);
  }
  if (rejectIds.length) {
    await c.supabase
      .from('intake_pending_answers')
      .update({ status: 'rejected', reviewed_at: nowIso, reviewed_by: c.userId })
      .eq('workspace_id', c.workspaceId)
      .in('id', rejectIds);
  }

  return NextResponse.json({ ok: true, accepted: acceptIds.length, rejected: rejectIds.length });
}
