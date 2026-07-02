/* ============================================
   LOWPASS — server loader for the rate-lines model (b2 UI phase)

   Loads a tour's rate context once — the workspace's rate_types catalog + every
   person's personnel_rate_lines — so a money reader can build each person's
   RateLines and run computeTotals, instead of reading the legacy
   personnel_rates.* columns.

   `rateLinesFor(ctx, personnelRateId, legacy, advanceFee)` returns the person's
   RateLines from the DB when present, and falls back to the legacy columns
   (ratesToLines) only for rows not yet backfilled — a transitional safety net.
   Post-migration 228+229 every person has lines, so the fallback is inert.
   (The fallback splits, so day_rate correctness relies on migration 229 having
   run — which re-seeds day_rate people onto the flat a6 line.)
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildRateLines, type RateTypeMeta, type RateLineRow } from './rateLines';
import { ratesToLines, type RateLike, type RateLine, type DayStatus, type RateBucket, type RateBasis } from './fees';

export interface TourRateContext {
  /** The workspace's rate_types (global defaults + customs), by order_index. */
  types: RateTypeMeta[];
  /** personnel_rate_id → its rate-line rows for this tour. */
  linesByRateId: Map<string, RateLineRow[]>;
}

/** Load the tour's rate context (catalog + all rate lines) in two queries. */
export async function loadTourRateContext(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourRateContext> {
  const [typesRes, linesRes] = await Promise.all([
    supabase
      .from('rate_types')
      .select('id, name, bucket, basis, day_statuses, order_index, workspace_id')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order('order_index', { ascending: true }),
    supabase
      .from('personnel_rate_lines')
      .select('personnel_rate_id, rate_type_id, amount')
      .eq('tour_id', tourId),
  ]);

  const types: RateTypeMeta[] = ((typesRes.data ?? []) as Array<{
    id: string; name: string; bucket: string; basis: string; day_statuses: string[] | null; order_index: number;
  }>).map((t) => ({
    id: t.id,
    name: t.name,
    bucket: t.bucket as RateBucket,
    basis: t.basis as RateBasis,
    dayStatuses: (t.day_statuses ?? []) as DayStatus[],
    orderIndex: t.order_index,
  }));

  const linesByRateId = new Map<string, RateLineRow[]>();
  for (const r of (linesRes.data ?? []) as Array<{ personnel_rate_id: string; rate_type_id: string; amount: number | string | null }>) {
    const arr = linesByRateId.get(r.personnel_rate_id) ?? [];
    arr.push({ rate_type_id: r.rate_type_id, amount: r.amount });
    linesByRateId.set(r.personnel_rate_id, arr);
  }

  return { types, linesByRateId };
}

/** A person's RateLines: from their rate_lines when present, else the legacy
 *  columns (ratesToLines) as a transitional fallback. */
export function rateLinesFor(
  ctx: TourRateContext,
  personnelRateId: string,
  legacy: RateLike,
  advanceFee: number | string | null = 0,
): RateLine[] {
  const rows = ctx.linesByRateId.get(personnelRateId);
  if (rows && rows.length > 0) return buildRateLines(rows, ctx.types);
  return ratesToLines(legacy, advanceFee);
}
