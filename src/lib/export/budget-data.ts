/* ============================================
   LOWPASS — Budget export data loader (#8 Document Export, Budget slice)

   ONE read-only loader that mirrors the budget PAGE's data flow
   (src/app/(app)/budget/[tourId]/page.tsx) so the PDF reconciles to the Summary
   tab TO THE CENT (smoke EXP-BUD-01). The two reconciliation-critical rules,
   copied exactly from the page:

     • LINES get the VIEWED version's proposed_cost overlay (page :292-297) and the
       transaction-aggregate enrichment that drives getEffectiveActual (page :238-255).
     • INCOME for the P&L is the RAW budget_income (page passes `incomeRows` —
       select('*') — to BudgetSummaryTab :377; it is NOT version-overlaid). We load
       it WITH the routing join so the same rows feed the detail table's context.

   Read-only: never writes. Caller has already auth'd + workspace-scoped the tour.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BudgetLineItem, BudgetSection } from '@/types';
import { enrichLinesWithTransactionAggregates } from '@/lib/budget/transactions';
import { loadTourFxRates } from '@/lib/budget/fxRates';
import type { FxRateMap } from '@/lib/budget/fxRates';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { resolveActiveVersion, resolveApprovedVersion, getProposedLineMap, type VersionStatus } from '@/server/budget/versions';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import type { CommissionInput, IncomeInput, PnlSettingsInput } from '@/lib/budget/computeBudgetPnl';

/** One per-show income row (raw budget_income + its routing context). */
export interface ExportIncomeRow extends IncomeInput {
  routing_id: string;
  date: string | null;
  venue_name: string | null;
  city: string | null;
}

export interface BudgetExportData {
  tour: { id: string; name: string; currency: string; start_date: string | null; end_date: string | null };
  artist: { name: string } | null;
  /** Raw (network) artist logo URL — the route inlines it to a data URI. */
  logoUrl: string | null;
  lines: BudgetLineItem[];
  income: ExportIncomeRow[];
  sections: BudgetSection[];
  commissions: CommissionInput[];
  settings: PnlSettingsInput | null;
  fxRates: FxRateMap;
  /** The viewed version (for the PDF label) — the same default the page lands on,
   *  or the requested `versionId`. Null when the tour has no versions. */
  viewed: { version_number: number; status: VersionStatus } | null;
}

/** Load everything the Budget PDF needs. `versionId` (optional) selects which
 *  version's proposed overlay to use — defaults to the page's landing version
 *  (approved Current, else the active head). */
export async function loadBudgetExportData(
  supabase: SupabaseClient,
  tour: { id: string; name: string; currency: string | null; start_date: string | null; end_date: string | null; artist_id: string | null },
  workspaceId: string,
  opts?: { versionId?: string | null },
): Promise<BudgetExportData> {
  const tourId = tour.id;

  const [lineItemsRes, sectionsRes, settingsRes, routingRes, artistRes, fxRates] = await Promise.all([
    supabase.from('budget_line_items').select('*').eq('tour_id', tourId).eq('workspace_id', workspaceId)
      .order('section').order('sort_order', { ascending: true }).order('category').order('order_index', { ascending: true }),
    supabase.from('budget_sections').select('*').eq('tour_id', tourId).eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    supabase.from('budget_settings').select('*').eq('tour_id', tourId).eq('workspace_id', workspaceId).maybeSingle(),
    // NOTE: routing has NO workspace_id column (scoped by tour_id; RLS via the
    // tour) — filtering it errored, which silently dropped ALL income from the
    // export P&L. Match the page (page.tsx:151 = .eq('tour_id') only).
    // Venue SSOT — SELECT discriminators + canonical join so the venue stamped
    // into each income row resolves live-vs-frozen (PURE READ; no freeze write).
    supabase.from('routing').select('id, date, city, country, address, venue_name, venue_capacity, venue_frozen_at, canonical_venue_id, canonical:canonical_venues(id, name, address, city, country, capacity)').eq('tour_id', tourId),
    tour.artist_id
      ? supabase.from('artists').select('id, name, branding, spotify_id, spotify_image_url').eq('id', tour.artist_id).maybeSingle()
      : Promise.resolve({ data: null }),
    loadTourFxRates(supabase, tourId, workspaceId),
  ]);

  const sections = (sectionsRes.data ?? []) as BudgetSection[];
  const settings = (settingsRes.data ?? null) as PnlSettingsInput | null;
  const artistRow = artistRes.data as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const logoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  // Income + commissions (the P&L inputs — RAW budget_income, matching the page).
  // Venue SSOT — resolve each routing row's venue before stamping it into the
  // income ctx, so budget-pdf renders the live-vs-frozen value (no logic change
  // in budget-pdf.ts — it just renders the resolved string).
  const routingRaw = (routingRes.data ?? []) as Array<RoutingVenueSource & { id: string; date: string | null }>;
  const routingById = new Map(
    routingRaw.map((r) => {
      const v = resolveVenue(r);
      return [r.id, { id: r.id, date: r.date, venue_name: v.name, city: v.city }] as const;
    }),
  );
  const routingIds = routingRaw.map((r) => r.id);

  const [incRes, commRes] = await Promise.all([
    routingIds.length
      ? supabase.from('budget_income').select('*').eq('workspace_id', workspaceId).in('routing_id', routingIds)
      : Promise.resolve({ data: [] }),
    supabase.from('budget_commissions').select('id, label, percentage, basis, order_index')
      .eq('tour_id', tourId).eq('workspace_id', workspaceId).order('order_index', { ascending: true }),
  ]);
  const income: ExportIncomeRow[] = ((incRes.data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const ctx = routingById.get(r.routing_id as string);
    return { ...(r as unknown as IncomeInput), routing_id: r.routing_id as string, date: ctx?.date ?? null, venue_name: ctx?.venue_name ?? null, city: ctx?.city ?? null };
  });
  // Sort by show date so the detail reads chronologically.
  income.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  const commissions = (commRes.data ?? []) as unknown as CommissionInput[];

  // Lines — enrich (transaction aggregates → getEffectiveActual) like the page.
  const rawLines = (lineItemsRes.data ?? []) as BudgetLineItem[];
  const lines = (await enrichLinesWithTransactionAggregates(supabase, rawLines).catch(() =>
    rawLines.map((l) => ({ ...l, transaction_sum: 0, transaction_count: 0 })),
  )) as BudgetLineItem[];

  // Resolve the viewed version + overlay its proposed_cost onto the lines (page :292-297).
  const [activeVersion, approvedVersion] = await Promise.all([
    resolveActiveVersion(supabase, tourId, workspaceId),
    resolveApprovedVersion(supabase, tourId, workspaceId),
  ]);
  let viewedId = opts?.versionId ?? null;
  let viewedMeta: { version_number: number; status: VersionStatus } | null = null;
  if (viewedId) {
    const { data } = await supabase.from('budget_versions').select('id, version_number, status').eq('id', viewedId).eq('workspace_id', workspaceId).maybeSingle();
    viewedMeta = data ? { version_number: (data as { version_number: number }).version_number, status: (data as { status: VersionStatus }).status } : null;
    if (!viewedMeta) viewedId = null; // requested version not in workspace → fall back
  }
  if (!viewedId) {
    const def = approvedVersion ?? activeVersion;
    viewedId = def?.id ?? null;
    viewedMeta = def ? { version_number: def.version_number, status: def.status } : null;
  }
  if (viewedId) {
    const proposedByLine = await getProposedLineMap(supabase, viewedId);
    for (const l of lines) {
      const p = proposedByLine.get(l.id);
      if (p !== undefined) (l as { proposed_cost: number }).proposed_cost = p;
    }
  }

  return {
    tour: { id: tourId, name: tour.name, currency: (tour.currency || 'GBP').toUpperCase(), start_date: tour.start_date, end_date: tour.end_date },
    artist: artistRow ? { name: artistRow.name } : null,
    logoUrl,
    lines,
    income,
    sections,
    commissions,
    settings,
    fxRates,
    viewed: viewedMeta,
  };
}
