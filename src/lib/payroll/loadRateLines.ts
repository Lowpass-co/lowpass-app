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

/** A card's legacy rate columns — the ONLY place they're read for the fallback. */
type LegacyRateCard = RateLike & { advance_fee?: number | string | null };

export interface TourRateContext {
  /** The workspace's rate_types (global defaults + customs), by order_index. */
  types: RateTypeMeta[];
  /** personnel_rate_id → its rate-line rows for this tour. */
  linesByRateId: Map<string, RateLineRow[]>;
  /** personnel_rate_id → its legacy columns, for the transitional fallback.
   *  Loaded here so no reader/component ever needs to select legacy columns. */
  legacyByRateId: Map<string, LegacyRateCard>;
}

/** Load the tour's rate context (catalog + all rate lines) in two queries. */
export async function loadTourRateContext(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourRateContext> {
  const [typesRes, linesRes, legacyRes] = await Promise.all([
    supabase
      .from('rate_types')
      .select('id, name, bucket, basis, day_statuses, order_index, workspace_id')
      .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
      .order('order_index', { ascending: true }),
    supabase
      .from('personnel_rate_lines')
      .select('personnel_rate_id, rate_type_id, amount')
      .eq('tour_id', tourId),
    // Legacy columns for the fallback — read HERE only (grep-gate allowed), so no
    // caller names them. Inert once every card has lines (migration 231 drops them).
    supabase
      .from('personnel_rates')
      .select('id, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee')
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

  const legacyByRateId = new Map<string, LegacyRateCard>();
  for (const c of (legacyRes.data ?? []) as Array<{ id: string } & LegacyRateCard>) {
    legacyByRateId.set(c.id, {
      show_rate: c.show_rate,
      off_rate: c.off_rate,
      rehearsal_rate: c.rehearsal_rate,
      per_diem: c.per_diem,
      advance_fee: c.advance_fee,
    });
  }

  return { types, linesByRateId, legacyByRateId };
}

/** Warned rate-ids (one line per id per process) so the fallback is visible but
 *  not spammy — watch it go quiet as every card gets lines. */
const warnedFallback = new Set<string>();

/** A person's RateLines: from their rate_lines when present, else the legacy
 *  columns as a transitional fallback (read from the ctx — callers never pass or
 *  name legacy columns). Logs once per rate-id when the fallback fires. An
 *  explicit `legacy`/`advanceFee` may still be passed (transitional callers). */
export function rateLinesFor(
  ctx: TourRateContext,
  personnelRateId: string,
  legacy?: RateLike,
  advanceFee?: number | string | null,
): RateLine[] {
  const rows = ctx.linesByRateId.get(personnelRateId);
  if (rows && rows.length > 0) return buildRateLines(rows, ctx.types);

  const card = legacy ?? ctx.legacyByRateId.get(personnelRateId) ?? {};
  const adv = advanceFee ?? (card as LegacyRateCard).advance_fee ?? 0;
  if (!warnedFallback.has(personnelRateId)) {
    warnedFallback.add(personnelRateId);
    console.warn(
      `[rates] fallback: personnel_rate ${personnelRateId} has no rate_lines — computing from legacy columns`,
    );
  }
  return ratesToLines(card, adv);
}
