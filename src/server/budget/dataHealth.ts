/* ============================================
   LOWPASS — Budget data-health derivation (M1-A / M1-B)

   ONE derivation, TWO consumers:
     • M1-A — the data-health banner on the Budget summary ("N items to review").
     • M1-B — the settlement catch-up queue ("N shows played, not settled") reuses
       the unsettled-shows slice below (no duplicate logic).

   Derivable checks ONLY (never a guess). All computed server-side at load from the
   existing single money path; no new tables. Planning-neutral (amber, not red) —
   these are nudges, not errors.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { detectDuplicates } from '@/server/budget/detectDuplicates';
import type { BudgetLineItem } from '@/types';
import { loadTourRateContext, rateAmountsFor } from '@/lib/payroll/loadRateLines';

export type HealthKind = 'unsettled_show' | 'income_no_fx' | 'zero_rate' | 'duplicate';

export interface HealthItem {
  kind: HealthKind;
  /** One-line summary, e.g. "3 shows played, not settled". */
  label: string;
  count: number;
  /** Deep-link to the fix surface. */
  href: string;
  /** Optional specifics for the expandable list. */
  detail: string[];
}

/** A past show with no full settlement — the catch-up queue's row shape. */
export interface UnsettledShow {
  routing_id: string;
  date: string | null;
  city: string | null;
  venue_name: string | null;
}

export interface DataHealth {
  items: HealthItem[];
  total: number;
  /** The catch-up queue consumes this directly (M1-B). */
  unsettledShows: UnsettledShow[];
}

const SHOW_DAY_TYPES = new Set(['show', 'festival']);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function computeDataHealth(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  tourCurrency: string,
): Promise<DataHealth> {
  const today = todayIso();
  const ccy = (tourCurrency || 'GBP').trim().toUpperCase();

  const [
    { data: routingRows },
    { data: incomeRows },
    { data: lineRows },
    { data: rateCards },
  ] = await Promise.all([
    supabase
      .from('routing')
      .select('id, date, day_type, city, venue_name')
      .eq('tour_id', tourId),
    supabase
      .from('budget_income')
      .select('routing_id, currency, locked_fx_rate')
      .eq('tour_id', tourId),
    supabase.from('budget_line_items').select('*').eq('tour_id', tourId),
    supabase
      .from('personnel_rates')
      .select('id, person_name')
      .eq('tour_id', tourId)
      .not('tour_personnel_id', 'is', null),
  ]);

  // Settlement rows for this tour's shows (grain = routing_id). A show counts as
  // settled only when the settlement exists AND is marked Full & Final.
  const routing = (routingRows ?? []) as Array<{
    id: string;
    date: string | null;
    day_type: string | null;
    city: string | null;
    venue_name: string | null;
  }>;
  const showRouting = routing.filter(
    (r) => SHOW_DAY_TYPES.has((r.day_type ?? '').toLowerCase()) && r.date && r.date < today,
  );
  const showRoutingIds = showRouting.map((r) => r.id);
  let settledIds = new Set<string>();
  if (showRoutingIds.length > 0) {
    const { data: settlements } = await supabase
      .from('settlement')
      .select('routing_id, full_and_final')
      .in('routing_id', showRoutingIds);
    settledIds = new Set(
      ((settlements ?? []) as Array<{ routing_id: string; full_and_final: boolean | null }>)
        .filter((s) => s.full_and_final)
        .map((s) => s.routing_id),
    );
  }

  // (a) Past shows not yet fully settled.
  const unsettledShows: UnsettledShow[] = showRouting
    .filter((r) => !settledIds.has(r.id))
    .map((r) => ({ routing_id: r.id, date: r.date, city: r.city, venue_name: r.venue_name }));

  // (b) Income lines in a foreign currency with no FX rate locked.
  const income = (incomeRows ?? []) as Array<{
    routing_id: string;
    currency: string | null;
    locked_fx_rate: number | null;
  }>;
  const noFx = income.filter(
    (i) => (i.currency ?? '').trim().toUpperCase() && (i.currency ?? '').trim().toUpperCase() !== ccy && i.locked_fx_rate == null,
  );

  // (c) Assigned payroll people with a zero effective rate.
  const cards = (rateCards ?? []) as Array<{ id: string; person_name: string | null }>;
  let zeroRate: string[] = [];
  if (cards.length > 0) {
    const ctx = await loadTourRateContext(supabase, tourId, workspaceId);
    zeroRate = cards
      .filter((c) => {
        const a = rateAmountsFor(ctx, c.id);
        return a.showRate === 0 && a.offRate === 0 && a.rehearsalRate === 0;
      })
      .map((c) => c.person_name?.trim() || 'Unnamed');
  }

  // (d) Duplicate budget lines (existing detector).
  const lines = (lineRows ?? []) as BudgetLineItem[];
  const dupeMap = detectDuplicates(lines);
  const dupeLineIds = new Set<string>(dupeMap.keys());

  const items: HealthItem[] = [];
  if (unsettledShows.length > 0) {
    items.push({
      kind: 'unsettled_show',
      count: unsettledShows.length,
      label: `${unsettledShows.length} ${unsettledShows.length === 1 ? 'show' : 'shows'} played, not settled`,
      href: `/budget/${tourId}/settlement`,
      detail: unsettledShows.map((s) => [s.date, s.city || s.venue_name].filter(Boolean).join(' · ')),
    });
  }
  if (noFx.length > 0) {
    items.push({
      kind: 'income_no_fx',
      count: noFx.length,
      label: `${noFx.length} income ${noFx.length === 1 ? 'line' : 'lines'} with no FX rate`,
      href: `/budget/${tourId}?tab=income`,
      detail: [],
    });
  }
  if (zeroRate.length > 0) {
    items.push({
      kind: 'zero_rate',
      count: zeroRate.length,
      label: `${zeroRate.length} assigned ${zeroRate.length === 1 ? 'person has' : 'people have'} no rate`,
      href: `/operations/${tourId}/payroll`,
      detail: zeroRate,
    });
  }
  if (dupeLineIds.size > 0) {
    items.push({
      kind: 'duplicate',
      count: dupeLineIds.size,
      label: `${dupeLineIds.size} possible duplicate budget ${dupeLineIds.size === 1 ? 'line' : 'lines'}`,
      href: `/budget/${tourId}?tab=budget`,
      detail: [],
    });
  }

  return {
    items,
    total: items.reduce((n, it) => n + it.count, 0),
    unsettledShows,
  };
}
