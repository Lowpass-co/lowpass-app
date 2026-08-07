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
import {
  buildRateLines,
  canonicalOrderOf,
  CANONICAL_RATE_TYPE_IDS,
  DEFAULT_RATE_TYPE_IDS,
  type RateTypeMeta,
  type RateLineRow,
} from './rateLines';
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

/** Assemble a TourRateContext from the three raw result sets. Shared by the
 *  single-tour and multi-tour loaders so the mapping lives in one place. */
function assembleRateContext(
  typesData: unknown,
  linesData: unknown,
  legacyData: unknown,
): TourRateContext {
  // CANONICAL FILTER (migration 261 / Adam's ruling): only the flat-seven
  // (+ Advance) load. Weekly (a8) and custom workspace types are retired here —
  // their rows + amounts stay in the DB but no longer bill or render.
  // Display order = Adam's canonical order, not raw order_index.
  const types: RateTypeMeta[] = ((typesData ?? []) as Array<{
    id: string; name: string; bucket: string; basis: string; day_statuses: string[] | null; order_index: number;
  }>)
    .filter((t) => CANONICAL_RATE_TYPE_IDS.includes(t.id))
    .map((t) => ({
      id: t.id,
      name: t.name,
      bucket: t.bucket as RateBucket,
      basis: t.basis as RateBasis,
      dayStatuses: (t.day_statuses ?? []) as DayStatus[],
      orderIndex: canonicalOrderOf(t.id),
    }))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const linesByRateId = new Map<string, RateLineRow[]>();
  for (const r of (linesData ?? []) as Array<{ personnel_rate_id: string; rate_type_id: string; amount: number | string | null }>) {
    const arr = linesByRateId.get(r.personnel_rate_id) ?? [];
    arr.push({ rate_type_id: r.rate_type_id, amount: r.amount });
    linesByRateId.set(r.personnel_rate_id, arr);
  }

  const legacyByRateId = new Map<string, LegacyRateCard>();
  for (const c of (legacyData ?? []) as Array<{ id: string } & LegacyRateCard>) {
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

/** Load the tour's rate context (catalog + all rate lines) in three queries. */
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

  return assembleRateContext(typesRes.data, linesRes.data, legacyRes.data);
}

/** Load ONE rate context spanning several tours (personnel_rate_id is a PK, so
 *  the line + legacy maps are unambiguous across tours). Used by cross-tour
 *  readers (e.g. the artist budget summary) so they never name legacy columns. */
export async function loadMultiTourRateContext(
  supabase: SupabaseClient,
  tourIds: string[],
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
      .in('tour_id', tourIds),
    // Legacy fallback columns — read HERE only (grep-gate allowed).
    supabase
      .from('personnel_rates')
      .select('id, show_rate, off_rate, rehearsal_rate, per_diem, advance_fee')
      .in('tour_id', tourIds),
  ]);

  return assembleRateContext(typesRes.data, linesRes.data, legacyRes.data);
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

/** The five individual rate amounts (camelCase, grep-clean) for a person —
 *  for DISPLAY / EDIT surfaces that show a single rate rather than a total.
 *  Sourced from the SSOT lines (a1 show / a2 off / a3 rehearsal / a4 per-diem /
 *  a5 advance); a `day_rate` card carries the flat a6 line instead of the split
 *  a1/a2/a3, so its amount surfaces as `offRate` — where writeRates mirrors the
 *  day rate — and show/rehearsal read 0. Falls back to the ctx's legacy columns
 *  for any card not yet backfilled (231-safe once the fallback goes quiet). */
export interface RateAmounts {
  showRate: number;
  offRate: number;
  rehearsalRate: number;
  perDiem: number;
  advanceFee: number;
}

export function rateAmountsFor(ctx: TourRateContext, personnelRateId: string): RateAmounts {
  const rows = ctx.linesByRateId.get(personnelRateId);
  if (rows && rows.length > 0) {
    const amt = (id: string): number => {
      const r = rows.find((x) => x.rate_type_id === id);
      return r ? Number(r.amount) || 0 : 0;
    };
    const hasDay = rows.some((x) => x.rate_type_id === DEFAULT_RATE_TYPE_IDS.dayRate);
    return {
      showRate: hasDay ? 0 : amt(DEFAULT_RATE_TYPE_IDS.show),
      offRate: hasDay ? amt(DEFAULT_RATE_TYPE_IDS.dayRate) : amt(DEFAULT_RATE_TYPE_IDS.offTravel),
      rehearsalRate: hasDay ? 0 : amt(DEFAULT_RATE_TYPE_IDS.rehearsal),
      perDiem: amt(DEFAULT_RATE_TYPE_IDS.perDiem),
      advanceFee: amt(DEFAULT_RATE_TYPE_IDS.advance),
    };
  }
  const legacy = ctx.legacyByRateId.get(personnelRateId);
  return {
    showRate: Number(legacy?.show_rate) || 0,
    offRate: Number(legacy?.off_rate) || 0,
    rehearsalRate: Number(legacy?.rehearsal_rate) || 0,
    perDiem: Number(legacy?.per_diem) || 0,
    advanceFee: Number(legacy?.advance_fee) || 0,
  };
}
