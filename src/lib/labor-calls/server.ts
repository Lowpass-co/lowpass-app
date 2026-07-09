/* ============================================
   LOWPASS — Labor calls · server read/apply helpers (P6)

   Server-only (supabase). Used by the API routes (client CRUD), the day-sheet /
   /m/today render, and the tour Crew › Labor rollup. RLS scopes every query to
   the caller's workspace; these helpers additionally filter by workspace_id for
   defence-in-depth (mirrors the budget-commissions pattern).
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LaborCall, LaborCallRow } from './types';
import { additiveLaborRows } from './merge';

/** All calls for one day (routing_id), call-time then sort-order. */
export async function listLaborCallsForRouting(
  supabase: SupabaseClient,
  workspaceId: string,
  routingId: string,
): Promise<LaborCall[]> {
  const { data } = await supabase
    .from('labor_calls')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('routing_id', routingId)
    .order('sort_order', { ascending: true })
    .order('call_time', { ascending: true, nullsFirst: false });
  return (data ?? []) as LaborCall[];
}

/** All calls for a whole tour (the Crew › Labor rollup), grouped-ready. */
export async function listLaborCallsForTour(
  supabase: SupabaseClient,
  workspaceId: string,
  tourId: string,
): Promise<LaborCall[]> {
  const { data } = await supabase
    .from('labor_calls')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('tour_id', tourId)
    .order('sort_order', { ascending: true });
  return (data ?? []) as LaborCall[];
}

/** Insert a batch of rows as calls on a day. Returns the created rows. Sort-order
 *  continues after whatever already exists (append). Pure DB write — no dedupe
 *  here (callers pass rows already filtered through additiveLaborRows). */
export async function createLaborCalls(
  supabase: SupabaseClient,
  ctx: { workspaceId: string; tourId: string | null; routingId: string },
  rows: LaborCallRow[],
): Promise<LaborCall[]> {
  if (rows.length === 0) return [];
  const existing = await listLaborCallsForRouting(supabase, ctx.workspaceId, ctx.routingId);
  const base = existing.reduce((m, c) => Math.max(m, c.sort_order), -1) + 1;
  const payload = rows.map((r, i) => ({
    workspace_id: ctx.workspaceId,
    tour_id: ctx.tourId,
    routing_id: ctx.routingId,
    department: r.department ?? '',
    call_time: r.call_time || null,
    headcount: r.headcount ?? null,
    company: r.company ?? '',
    contact_name: r.contact_name ?? '',
    contact_phone: r.contact_phone ?? '',
    meal_break_notes: r.meal_break_notes ?? '',
    union_notes: r.union_notes ?? '',
    notes: r.notes ?? '',
    sort_order: base + i,
  }));
  const { data } = await supabase.from('labor_calls').insert(payload).select('*');
  return (data ?? []) as LaborCall[];
}

/** Apply a set of incoming rows (a template or accepted intake) to a day —
 *  ADDITIVE + never-clobber (existing calls untouched; duplicates skipped).
 *  Returns the calls actually created. The ONE merge rule lives in merge.ts. */
export async function applyRowsToDay(
  supabase: SupabaseClient,
  ctx: { workspaceId: string; tourId: string | null; routingId: string },
  incoming: LaborCallRow[],
): Promise<LaborCall[]> {
  const existing = await listLaborCallsForRouting(supabase, ctx.workspaceId, ctx.routingId);
  const toCreate = additiveLaborRows(existing, incoming);
  return createLaborCalls(supabase, ctx, toCreate);
}
