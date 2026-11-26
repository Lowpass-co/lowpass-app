/* ============================================
   LOWPASS — tour Overview: the facts (Nov 2026, Adam)

   Reads only — a page load writes nothing (the P&L is read with
   reconcile:false). Every fact comes from the loader the page it links to
   uses, so the Overview never disagrees with that page:
     advance  → loadAdvanceBoard (the board's own rows)
     receipts → countReceiptsNeedingDetails (the rail badge)
     money    → loadTourPnl (THE formula, tour currency)
     rider    → the Riders page's rows + lib/riders/status (to send / to answer)
   Rules: src/lib/tour/overview.ts.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { loadAdvanceBoard, type BoardShowRow } from '@/server/advance/board';
import { countReceiptsNeedingDetails } from '@/lib/budget/loadReceipts';
import { loadTourPnl } from '@/server/budget/loadTourPnl';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { ALLOW_ALL, isShowDay, type OverviewAllow, type OverviewFacts } from '@/lib/tour/overview';
import { logServerError } from '@/lib/log/serverError';
import { repliesToAnswer, showsToSend } from '@/lib/riders/status';
import { loadRiderShows } from '@/server/riders/data';

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

  const [receipts, settleRes, packsRes, pnl, riders] = await Promise.all([
    allow.receipts ? countReceiptsNeedingDetails(supabase, tourId) : Promise.resolve(0),
    allow.budget && showDayIds.length
      ? supabase.from('settlement').select('routing_id, status').in('routing_id', showDayIds)
      : Promise.resolve({ data: [] as Array<{ routing_id: string; status: string | null }>, error: null }),
    allow.production
      ? supabase.from('rider_packs').select('kind, updated_at').eq('tour_id', tourId).in('kind', ['channel_list', 'stage_plot'])
      : Promise.resolve({ data: [] as Array<{ kind: string | null; updated_at: string | null }>, error: null }),
    (allow.budget ? loadTourPnl(supabase, tourId, workspaceId, { reconcile: false }) : Promise.resolve(null)).catch((e) => {
      // Money is one line of the page — a failed read hides that line rather
      // than taking the whole Overview down.
      logServerError('tour overview: pnl', e, { tourId });
      return null;
    }),
    allow.production ? loadRiderFacts(supabase, tourId, today) : Promise.resolve(null),
  ]);

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
      riders,
    },
  };
}

/** The rider's to-do facts, through the SAME rules the Riders page uses
 *  (lib/riders/status) on the same rows its loader reads. Fails soft: before
 *  migration 301 is pasted (or on any read error) the rider simply isn't
 *  mentioned beyond "not made". */
async function loadRiderFacts(supabase: SupabaseClient, tourId: string, today: string): Promise<OverviewFacts['riders']> {
  try {
    const [docsRes, latestRes, linksRes, sendsRes, repliesRes, shows] = await Promise.all([
      supabase.from('riders').select('id').eq('tour_id', tourId),
      supabase.from('rider_versions').select('id, major, minor, published_at').eq('tour_id', tourId).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('rider_links').select('id, routing_id').eq('tour_id', tourId).is('revoked_at', null),
      supabase.from('rider_sends').select('link_id, version_id').eq('tour_id', tourId).order('sent_at', { ascending: false }).limit(1000),
      supabase.from('rider_replies').select('link_id, block_id, author, resolved_at').eq('tour_id', tourId).order('created_at', { ascending: true }).limit(2000),
      loadRiderShows(supabase, tourId),
    ]);
    if (docsRes.error) return null;
    const latest = latestRes.data as { id: string; major: number; minor: number; published_at: string } | null;
    const links = ((linksRes.data ?? []) as { id: string; routing_id: string | null }[]).map((l) => ({ id: l.id, routingId: l.routing_id }));
    const sends = ((sendsRes.data ?? []) as { link_id: string; version_id: string }[]).map((x) => ({ linkId: x.link_id, versionId: x.version_id }));
    const replies = ((repliesRes.data ?? []) as { link_id: string; block_id: string; author: 'venue' | 'tour'; resolved_at: string | null }[]).map((r) => ({
      linkId: r.link_id,
      blockId: r.block_id,
      author: r.author,
      resolvedAt: r.resolved_at,
    }));
    return {
      docs: (docsRes.data ?? []).length,
      latest: latest ? { label: `${latest.major}.${latest.minor}`, publishedAt: latest.published_at } : null,
      toSend: showsToSend(shows, links, sends, latest?.id ?? null, today).length,
      toAnswer: repliesToAnswer(replies),
    };
  } catch (e) {
    logServerError('tour overview: riders', e, { tourId });
    return null;
  }
}
