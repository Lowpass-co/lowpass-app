/* ============================================
   LOWPASS — Labor calls API (P6)

   GET    ?routing_id=uuid  → calls for a day  ·  ?tour_id=uuid → calls for a tour
   POST   { tour_id, routing_id, ...row? }     → create one call (appended)
   PATCH  { id, ...fields }                     → update a call
   DELETE { id }                                → delete a call

   NOT payroll — never touches rate_lines / fees / provenance / FX. Workspace-
   scoped (RLS + explicit workspace_id filter).
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  listLaborCallsForRouting,
  listLaborCallsForTour,
  createLaborCalls,
} from '@/lib/labor-calls/server';
import { emptyLaborRow, type LaborCallRow } from '@/lib/labor-calls/types';

const EDITABLE = [
  'department',
  'call_time',
  'headcount',
  'company',
  'contact_name',
  'contact_phone',
  'meal_break_notes',
  'union_notes',
  'notes',
  'sort_order',
] as const;

async function ctx() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) return { error: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  return { supabase, workspaceId: profile.workspace_id as string };
}

export async function GET(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const { searchParams } = new URL(request.url);
  const routingId = searchParams.get('routing_id');
  const tourId = searchParams.get('tour_id');
  if (routingId) {
    return NextResponse.json({ calls: await listLaborCallsForRouting(c.supabase, c.workspaceId, routingId) });
  }
  if (tourId) {
    return NextResponse.json({ calls: await listLaborCallsForTour(c.supabase, c.workspaceId, tourId) });
  }
  return NextResponse.json({ error: 'routing_id or tour_id is required' }, { status: 400 });
}

export async function POST(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const auth = await requireWrite(c.supabase);
  if ('error' in auth) return auth.error;
  let body: { tour_id?: string | null; routing_id?: string; row?: Partial<LaborCallRow> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.routing_id) return NextResponse.json({ error: 'routing_id is required' }, { status: 400 });
  const row: LaborCallRow = { ...emptyLaborRow(), ...(body.row ?? {}) };
  const created = await createLaborCalls(
    c.supabase,
    { workspaceId: c.workspaceId, tourId: body.tour_id ?? null, routingId: body.routing_id },
    [row],
  );
  return NextResponse.json({ call: created[0] ?? null }, { status: 201 });
}

export async function PATCH(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const auth = await requireWrite(c.supabase);
  if ('error' in auth) return auth.error;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = body.id;
  if (typeof id !== 'string') return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of EDITABLE) if (k in body) patch[k] = k === 'call_time' ? (body[k] || null) : body[k];
  const { data, error } = await c.supabase
    .from('labor_calls')
    .update(patch)
    .eq('id', id)
    .eq('workspace_id', c.workspaceId)
    .select('*')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ call: data });
}

export async function DELETE(request: Request) {
  const c = await ctx();
  if ('error' in c) return c.error;
  const auth = await requireWrite(c.supabase);
  if ('error' in auth) return auth.error;
  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  const { error } = await c.supabase
    .from('labor_calls')
    .delete()
    .eq('id', body.id)
    .eq('workspace_id', c.workspaceId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
