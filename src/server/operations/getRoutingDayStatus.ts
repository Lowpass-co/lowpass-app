/* ============================================
   LOWPASS — Routing day status derivation (R2)

   ONE derivation for the ledger's per-row status dots (advance · hotel · crew).
   Runs in the routing page loader — a single batch of three queries for the whole
   tour, NOT a per-cell query. Keyed by DATE (YYYY-MM-DD) because the client's
   routing rows are date-indexed (buildInitialRows maps by date, ids aren't carried
   to the grid).

   Dot semantics (grey = untouched, green = done, amber = needs attention):
     - advance: green when the advance instance is complete/submitted, amber while
       in_progress, grey when not started / no instance.
     - hotel:   green when a hotel is attached for the night (routing show_id link,
       or the hotel's [check_in, check_out) window covers the date), else grey.
     - crew:    green when the day has ≥1 labor call, else grey.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';

export type DotState = 'off' | 'done' | 'warn';

export interface RoutingDayStatus {
  advance: DotState;
  hotel: DotState;
  crew: DotState;
}

export type RoutingStatusByDate = Record<string, RoutingDayStatus>;

function isoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  // Accept both a bare date ('2026-10-03') and a timestamptz — slice the date part.
  return value.slice(0, 10);
}

/** Derive the advance dot from an advance_instances.status string. */
function advanceDot(status: string | null | undefined): DotState {
  const s = (status ?? '').toLowerCase();
  if (s === 'complete' || s === 'completed' || s === 'submitted' || s === 'done') return 'done';
  if (s === 'in_progress' || s === 'in-progress' || s === 'started') return 'warn';
  return 'off';
}

/**
 * Batch-derive per-date status for every routing day of a tour.
 * Three queries total (routing, advance_instances, hotels, labor_calls) — no
 * per-cell fetches. Returns a map keyed by YYYY-MM-DD.
 */
export async function getRoutingDayStatus(
  supabase: SupabaseClient,
  { tourId }: { tourId: string },
): Promise<RoutingStatusByDate> {
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date')
    .eq('tour_id', tourId);

  const rows = (routingRows ?? []) as Array<{ id: string; date: string }>;
  if (rows.length === 0) return {};

  const ids = rows.map((r) => r.id);
  const dateById = new Map(rows.map((r) => [r.id, isoDate(r.date)] as const));

  // Seed every day 'off' so the ledger always has a status entry to read.
  const byDate: RoutingStatusByDate = {};
  for (const r of rows) {
    const d = isoDate(r.date);
    if (d) byDate[d] = { advance: 'off', hotel: 'off', crew: 'off' };
  }

  const [advanceRes, hotelsRes, laborRes] = await Promise.all([
    supabase.from('advance_instances').select('routing_id, status').in('routing_id', ids),
    supabase
      .from('hotels')
      .select('show_id, check_in_at, check_out_at')
      .eq('tour_id', tourId),
    supabase.from('labor_calls').select('routing_id').in('routing_id', ids),
  ]);

  // advance — worst-known state wins (done > warn > off) so a day with any
  // in-progress instance still signals attention.
  for (const a of (advanceRes.data ?? []) as Array<{ routing_id: string; status: string | null }>) {
    const d = dateById.get(a.routing_id);
    if (!d || !byDate[d]) continue;
    const dot = advanceDot(a.status);
    if (dot === 'done' || (dot === 'warn' && byDate[d].advance !== 'done')) {
      byDate[d].advance = dot;
    }
  }

  // hotel — green for the linked night (show_id) or any night the stay window covers.
  for (const h of (hotelsRes.data ?? []) as Array<{
    show_id: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
  }>) {
    if (h.show_id) {
      const d = dateById.get(h.show_id);
      if (d && byDate[d]) byDate[d].hotel = 'done';
    }
    const ci = isoDate(h.check_in_at);
    const co = isoDate(h.check_out_at);
    if (ci) {
      for (const d of Object.keys(byDate)) {
        // [check_in, check_out) — a stay covers each night from check-in up to
        // (not including) check-out. When no check-out is known, mark just check-in.
        if (co ? d >= ci && d < co : d === ci) byDate[d].hotel = 'done';
      }
    }
  }

  // crew — green for any day that has at least one labor call.
  for (const l of (laborRes.data ?? []) as Array<{ routing_id: string }>) {
    const d = dateById.get(l.routing_id);
    if (d && byDate[d]) byDate[d].crew = 'done';
  }

  return byDate;
}
