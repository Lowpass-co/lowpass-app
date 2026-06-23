/* ============================================
   LOWPASS — Budget income server load + mapping (shared)

   ONE source for the routing + budget_income merge so the GET route and the
   server page can't diverge (BUD-50 fix: feed Income by props, like Expenses,
   instead of a client fetch that never commits). The bridge is unchanged —
   same fields, same rows; this only centralises the read + the row mapping.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logServerError } from '@/lib/log/serverError';

export interface ServerIncome {
  routing_id: string;
  routing?: { date?: string; venue_name?: string; city?: string; day_type?: string } | null;
  pre_tax_guarantee?: number;
  withholding_pct?: number;
  pre_tax_overage?: number;
  merch_income?: number;
  vip_income?: number;
  actual_guarantee?: number | null;
  actual_overage?: number | null;
  actual_merch?: number | null;
  actual_vip?: number | null;
}
export interface RoutingOnly {
  id: string;
  date?: string | null;
  venue_name?: string | null;
  city?: string | null;
  day_type?: string | null;
}
export interface TourIncomePayload {
  income: ServerIncome[];
  routing_only: RoutingOnly[];
}

/** One row per show, ready for the grid. */
export interface IncomeRow {
  routing_id: string;
  date: string | null;
  venue_name: string | null;
  city: string | null;
  /** INC-01 — routing day type (show/travel/off…) for the read-only Type column. */
  day_type: string | null;
  pre_tax_guarantee: number;
  withholding_pct: number;
  pre_tax_overage: number;
  merch_income: number;
  vip_income: number;
  actual_guarantee: number;
  actual_overage: number;
  actual_merch: number;
  actual_vip: number;
}

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

/** Routing + budget_income merge (income rows + routing-only zero rows).
 *  Caller must have already auth'd + resolved the workspace + tour. */
export async function loadTourIncome(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourIncomePayload> {
  // P0 — the income prop-feed runs in the budget page's SSR; a data-shape edge
  // here must degrade to "no income" rather than crash the whole page.
  try {
    return await loadTourIncomeImpl(supabase, tourId, workspaceId);
  } catch (err) {
    logServerError('loadTourIncome failed', err, { tourId });
    return { income: [], routing_only: [] };
  }
}

async function loadTourIncomeImpl(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
): Promise<TourIncomePayload> {
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, venue_name, city, day_type')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const routingIds = (routingRows ?? []).map((r) => r.id as string);
  if (routingIds.length === 0) return { income: [], routing_only: (routingRows ?? []) as RoutingOnly[] };

  const { data: incomeRows } = await supabase
    .from('budget_income')
    .select('*, routing(date, venue_name, city, day_type)')
    .in('routing_id', routingIds)
    .eq('workspace_id', workspaceId);

  const incomeWithRouting = (incomeRows ?? []).map((row) => ({
    ...row,
    routing: Array.isArray(row.routing) ? row.routing[0] : row.routing,
  })) as ServerIncome[];
  const income = incomeWithRouting
    .slice()
    .sort((a, b) => (a.routing?.date ?? '').localeCompare(b.routing?.date ?? ''));

  const incomeRoutingIds = new Set((incomeRows ?? []).map((r) => r.routing_id as string));
  const routing_only = (routingRows ?? []).filter((r) => !incomeRoutingIds.has(r.id as string)) as RoutingOnly[];

  return { income, routing_only };
}

/** Map the payload → grid IncomeRow[] (income rows then routing-only, by date). */
export function toIncomeRows(payload: TourIncomePayload): IncomeRow[] {
  const fromIncome: IncomeRow[] = (payload.income ?? []).map((i) => ({
    routing_id: i.routing_id,
    date: i.routing?.date ?? null,
    venue_name: i.routing?.venue_name ?? null,
    city: i.routing?.city ?? null,
    day_type: i.routing?.day_type ?? null,
    pre_tax_guarantee: n(i.pre_tax_guarantee),
    withholding_pct: n(i.withholding_pct),
    pre_tax_overage: n(i.pre_tax_overage),
    merch_income: n(i.merch_income),
    vip_income: n(i.vip_income),
    actual_guarantee: n(i.actual_guarantee),
    actual_overage: n(i.actual_overage),
    actual_merch: n(i.actual_merch),
    actual_vip: n(i.actual_vip),
  }));
  const fromRouting: IncomeRow[] = (payload.routing_only ?? []).map((r) => ({
    routing_id: r.id,
    date: r.date ?? null,
    venue_name: r.venue_name ?? null,
    city: r.city ?? null,
    day_type: r.day_type ?? null,
    pre_tax_guarantee: 0,
    withholding_pct: 0,
    pre_tax_overage: 0,
    merch_income: 0,
    vip_income: 0,
    actual_guarantee: 0,
    actual_overage: 0,
    actual_merch: 0,
    actual_vip: 0,
  }));
  return [...fromIncome, ...fromRouting].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
}
