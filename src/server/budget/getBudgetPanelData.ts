/* ============================================
   LOWPASS — Budget panel data (Phase B budget redesign)

   Server data fetcher for the macro allocation donut and the burn-
   rate bar chart. Reads `budget_line_items` for a tour, aggregates
   per-category totals (donut) and per-day totals (burn). Currency
   conversion happens client-side via lib/budget/fx so the server
   helper stays cheap and async-only — single round-trip.

   Bucketing strategy: tours up to 60 days bucket daily; 60–180 days
   bucket weekly; longer tours bucket monthly. Keeps the bar chart
   readable without forcing a 600-bar render on long tours.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type AllocationSegment = { label: string; amount: number };
export type BurnBucket = { key: string; amount: number };

export type BudgetPanelData = {
  /** Per-category sums, sorted desc by amount. */
  allocation: AllocationSegment[];
  /** Daily / weekly / monthly buckets, ordered ascending. */
  burn: BurnBucket[];
  /** "daily" | "weekly" | "monthly" — informational, mostly for axis labels. */
  burnGranularity: 'daily' | 'weekly' | 'monthly';
};

type LineItemRow = {
  category: string | null;
  actual_cost: number | null;
  proposed_cost: number | null;
  routing_id: string | null;
  created_at: string | null;
};

type RoutingRow = {
  id: string;
  date: string | null;
};

function isoWeekKey(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  // ISO 8601 week: Thursday in the same week determines the ISO year.
  const tmp = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7; // 0 = Monday
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const week = 1 +
    Math.round(
      ((tmp.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${tmp.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function daysBetween(startIso: string, endIso: string): number {
  const s = new Date(`${startIso}T12:00:00Z`).getTime();
  const e = new Date(`${endIso}T12:00:00Z`).getTime();
  if (Number.isNaN(s) || Number.isNaN(e)) return 0;
  return Math.max(0, Math.round((e - s) / 86400000));
}

export async function getBudgetPanelData(
  supabase: SupabaseClient,
  tourId: string,
): Promise<BudgetPanelData> {
  const { data: tourRow } = await supabase
    .from('tours')
    .select('start_date, end_date')
    .eq('id', tourId)
    .maybeSingle();

  const tourStart = (tourRow?.start_date as string | null) ?? null;
  const tourEnd = (tourRow?.end_date as string | null) ?? null;

  const tourSpan = tourStart && tourEnd ? daysBetween(tourStart, tourEnd) : 0;
  const granularity: BudgetPanelData['burnGranularity'] =
    tourSpan <= 60 ? 'daily' : tourSpan <= 180 ? 'weekly' : 'monthly';

  // Pull line items + routing in parallel so we can attribute spend to a
  // calendar date even when the line item itself has no date column.
  const [linesRes, routingRes] = await Promise.all([
    supabase
      .from('budget_line_items')
      .select('category, actual_cost, proposed_cost, routing_id, created_at')
      .eq('tour_id', tourId),
    supabase
      .from('routing')
      .select('id, date')
      .eq('tour_id', tourId),
  ]);

  const lines = (linesRes.data ?? []) as LineItemRow[];
  const routingMap = new Map<string, string>();
  for (const r of (routingRes.data ?? []) as RoutingRow[]) {
    if (r.id && r.date) routingMap.set(r.id, r.date.slice(0, 10));
  }

  // Allocation aggregate.
  const allocationMap = new Map<string, number>();
  for (const line of lines) {
    const amt = Number(line.actual_cost ?? 0);
    if (!Number.isFinite(amt)) continue;
    const cat = (line.category ?? 'uncategorised').toString();
    allocationMap.set(cat, (allocationMap.get(cat) ?? 0) + amt);
  }
  const allocation: AllocationSegment[] = Array.from(allocationMap.entries())
    .map(([label, amount]) => ({
      // Title-case the category for display ("crew" → "Crew").
      label: label
        .split(/[_\s-]+/)
        .filter(Boolean)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' '),
      amount,
    }))
    .filter((s) => s.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  // Burn buckets — bucket key resolves the line item's date through
  // routing_id, falling back to created_at when no routing_id is set.
  const burnMap = new Map<string, number>();
  for (const line of lines) {
    const amt = Number(line.actual_cost ?? 0);
    if (!Number.isFinite(amt) || amt === 0) continue;
    const date =
      (line.routing_id && routingMap.get(line.routing_id)) ||
      (line.created_at ? line.created_at.slice(0, 10) : null);
    if (!date) continue;
    const key =
      granularity === 'daily'
        ? date
        : granularity === 'weekly'
          ? isoWeekKey(date)
          : monthKey(date);
    burnMap.set(key, (burnMap.get(key) ?? 0) + amt);
  }
  const burn: BurnBucket[] = Array.from(burnMap.entries())
    .map(([key, amount]) => ({ key, amount }))
    .sort((a, b) => a.key.localeCompare(b.key));

  return { allocation, burn, burnGranularity: granularity };
}
