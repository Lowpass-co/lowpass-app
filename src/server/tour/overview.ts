/* ============================================
   LOWPASS — tour Overview: the facts (Nov 2026, Adam)

   Reads only — a page load writes nothing (the P&L is read with
   reconcile:false). Every fact comes from the loader the page it links to
   uses, so the Overview never disagrees with that page:
     advance  → loadAdvanceBoard (the board's own rows)
     receipts → countReceiptsNeedingDetails (the rail badge)
     money    → loadTourPnl (THE formula, tour currency)
   Rules: src/lib/tour/overview.ts.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdvanceBoard, type BoardShowRow } from '@/server/advance/board';
import { countReceiptsNeedingDetails } from '@/lib/budget/loadReceipts';
import { loadTourPnl } from '@/server/budget/loadTourPnl';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { ALLOW_ALL, isShowDay, type OverviewAllow, type OverviewFacts } from '@/lib/tour/overview';
import { logServerError } from '@/lib/log/serverError';

export interface TourOverviewData {
  tour: { id: string; name: string };
  facts: OverviewFacts;
}

export async function loadTourOverview(
  supabase: SupabaseClient,
  tourId: string,
  workspaceId: string,
  allow: OverviewAllow = ALLOW_ALL,
  today = new Date().toISOString().slice(0, 10),
): Promise<TourOverviewData | null> {
  const board = await loadAdvanceBoard(supabase, tourId);
  if (!board) return null;
  // The show days are needed for the next show and settlements even when the
  // advance answers themselves aren't the viewer's to see.
  const shows = board.rows.filter((r): r is BoardShowRow => r.kind === 'show');
  const showDayIds = shows.filter((s) => isShowDay(s.dayType)).map((s) => s.routingId);

  const [receipts, crewRes, settleRes, packsRes, pnl] = await Promise.all([
    allow.receipts ? countReceiptsNeedingDetails(supabase, tourId) : Promise.resolve(0),
    allow.crew
      ? supabase.from('tour_personnel').select('status').eq('tour_id', tourId)
      : Promise.resolve({ data: [] as Array<{ status: string | null }>, error: null }),
    allow.budget && showDayIds.length
      ? supabase.from('settlement').select('routing_id, status').in('routing_id', showDayIds)
      : Promise.resolve({ data: [] as Array<{ routing_id: string; status: string | null }>, error: null }),
    allow.production
      ? supabase.from('rider_packs').select('kind, updated_at').eq('tour_id', tourId)
      : Promise.resolve({ data: [] as Array<{ kind: string | null; updated_at: string | null }>, error: null }),
    (allow.budget ? loadTourPnl(supabase, tourId, workspaceId, { reconcile: false }) : Promise.resolve(null)).catch((e) => {
      // Money is one line of the page — a failed read hides that line rather
      // than taking the whole Overview down.
      logServerError('tour overview: pnl', e, { tourId });
      return null;
    }),
  ]);

  const unconfirmedCrew = ((crewRes.data ?? []) as Array<{ status: string | null }>).filter(
    (p) => p.status === 'tentative' || p.status === 'awaiting_contract',
  ).length;
  const settledRoutingIds = new Set(
    ((settleRes.data ?? []) as Array<{ routing_id: string; status: string | null }>)
      .filter((s) => s.status === 'reconciled')
      .map((s) => s.routing_id),
  );

  const production: OverviewFacts['production'] = [];
  for (const p of (packsRes.data ?? []) as Array<{ kind: string | null; updated_at: string | null }>) {
    const kind = p.kind === 'channel_list' || p.kind === 'stage_plot' ? p.kind : 'rider';
    const cur = production.find((x) => x.kind === kind);
    if (!cur) production.push({ kind, count: 1, updatedAt: p.updated_at });
    else {
      cur.count += 1;
      if (p.updated_at && (!cur.updatedAt || p.updated_at > cur.updatedAt)) cur.updatedAt = p.updated_at;
    }
  }

  // Over estimate: per line, in that line's own currency (no cross-currency sum).
  const linesOverEstimate = pnl
    ? pnl.lines.filter((l) => !isIncomeRow(l) && Number(l.proposed_cost) > 0 && Number(l.actual_cost) > Number(l.proposed_cost)).length
    : 0;

  return {
    tour: { id: board.tour.id, name: board.tour.name },
    facts: {
      tourId,
      today,
      allow,
      shows: shows.map((s) => ({
        routingId: s.routingId,
        date: s.date,
        dayType: s.dayType,
        venue: s.venue,
        city: s.city,
        answered: s.answered,
        total: s.total,
        toReview: s.toReview,
        requestKind: s.request.kind,
        requestLabel: s.request.label,
      })),
      settledRoutingIds,
      receiptsNeedingDetails: receipts,
      unconfirmedCrew,
      linesOverEstimate,
      money: pnl
        ? {
            currency: pnl.tourCurrency,
            plannedCosts: pnl.pnl.totalExpenses.projected,
            spentCosts: pnl.pnl.totalExpenses.actual,
            plannedNet: pnl.pnl.net.projected,
          }
        : null,
      production,
    },
  };
}
