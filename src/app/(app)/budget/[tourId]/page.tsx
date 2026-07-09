/* ============================================
   LOWPASS — Budget · Tour landing (Phase 3 §C tab nav)

   /budget/[tourId] — wraps the budget hub in <ProductShell> with
   five tabs (Summary / Budget / Actuals / Reports / Settings).
   Tab state via ?tab= searchParam; Summary is the default.

   Layout (top → bottom):
     <ProductShell>
       <BudgetBurnBar>            (sticky — runway + spend meter)
       <BudgetPhaseStripClient>    (sticky — phase context)
       <BudgetContextBand>        (Band 2 — identity + tabs + actions)
       <tab-content>               (Summary | Budget | Actuals | Reports | Settings)
     </ProductShell>

   Summary tab carries the big-picture surface (charts, variance,
   top spend, recent activity). Budget tab carries the dense
   line-item spreadsheet from §B + Receipt Inbox sidebar. Other
   three are placeholders this sprint.
   ============================================ */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { MobileBudgetBanner } from '@/components/mobile/MobileBudgetBanner';
import { BudgetPhaseStripClient } from '@/components/budget/BudgetPhaseStripClient';
import { BudgetPhaseStripGate } from '@/components/budget/BudgetPhaseStripReveal';
import { BudgetTrackPhasesProvider } from '@/components/budget/BudgetTrackPhasesContext';
import { BudgetBurnBar } from '@/components/budget/BudgetBurnBar';
import { BudgetContextBand } from '@/components/budget/BudgetContextBand';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { BudgetSpreadsheetView } from '@/components/budget/BudgetSpreadsheetView';
import { BudgetGridToggle } from '@/components/budget/BudgetGridToggle';
import { BudgetGridView } from '@/components/budget/BudgetGridView';
import { BudgetIncomeGrid } from '@/components/budget/BudgetIncomeGrid';
import { BudgetEmptyState } from '@/components/budget/BudgetEmptyState';
import { BudgetSettingsTab } from '@/components/budget/BudgetSettingsTab';
import { ReceiptInbox } from '@/components/budget/ReceiptInbox';
// Fix 3 — Budget's sub-tabs (Summary/Expenses/Income + corner
// Reports/Settings) render in <BudgetContextBand> (Band 2). The page
// only needs the server-safe resolveBudgetTab helper to pick which tab
// body to render.
import { resolveBudgetTab } from '@/components/budget/budget-tab-utils';
import { BudgetDensityProvider } from '@/components/budget/BudgetDensityContext';
import { enrichLinesWithTransactionAggregates, fetchLineVendors } from '@/lib/budget/transactions';
import { enrichLinesWithAttachmentCounts } from '@/lib/budget/attachments';
import { loadTourIncome, toIncomeRows } from '@/lib/budget/income';
import { BudgetSummaryDashboard } from '@/components/budget/summary-cards/BudgetSummaryDashboard';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeTourPhases } from '@/server/budget/computeTourPhases';
import { getBudgetPanelData } from '@/server/budget/getBudgetPanelData';
import { reconcileDerivedBudgetLines } from '@/server/budget/reconcileDerivedLines';
import { resolveActiveVersion, getProposedLineMap, getProposedIncomeMap } from '@/server/budget/versions';
import { loadTourFxRates } from '@/lib/budget/fxRates';
import { FxMissingRateBanner } from '@/components/budget/FxMissingRateBanner';
import type { BudgetVersionVm } from '@/components/budget/versioning/versionApi';
import { logServerError } from '@/lib/log/serverError';
import type {
  IncomeInput,
  CommissionInput,
} from '@/lib/budget/computeBudgetPnl';
import {
  detectDuplicates,
  duplicatesToRecord,
} from '@/server/budget/detectDuplicates';
import type { BudgetLineItem, BudgetSection } from '@/types';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tourId: string }>;
}): Promise<Metadata> {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour } = await supabase
    .from('tours')
    .select('name')
    .eq('id', tourId)
    // P0 — .maybeSingle() returns { data: null } on no-row instead of THROWING
    // (a thrown metadata error reads as a generic failure); the page itself
    // notFound()s the missing tour.
    .maybeSingle();
  return { title: tour?.name ? `${tour.name} — Budget` : 'Budget' };
}

export default async function BudgetTourPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<{ tab?: string; version?: string }>;
}) {
  const { tourId } = await params;
  const sp = await searchParams;
  const tab = resolveBudgetTab(sp.tab);
  const supabase = await createServerSupabaseClient();

  // Hotfix v2 §B 2026-05-04 — was .single() which THROWS when zero
  // rows match (RLS silently filtering one out reads as a thrown
  // "JSON object requested, multiple (or no) rows returned" error
  // that escapes to the root error boundary as "Refresh, something
  // went wrong"). .maybeSingle() returns { data: null } on no-row,
  // which we explicitly notFound() below.
  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select(
      'id, name, workspace_id, currency, artist_id, start_date, end_date',
    )
    .eq('id', tourId)
    .maybeSingle();

  if (tourErr || !tour) {
    notFound();
  }

  // workspace_id is NOT NULL on tours, but cast-as-string would
  // silently propagate a null if RLS / a future schema change ever
  // surfaces one. Guard explicitly + notFound for the malformed-row
  // case so it degrades to a 404 not a crash.
  const workspaceId = tour.workspace_id as string | null;
  if (!workspaceId) {
    notFound();
  }

  /* Budget ← Operations linking — reconcile derived lines (rooming +
     payroll) BEFORE reading lines + sections, so the grid shows fresh
     derived rows and their auto-created sections on load. Self-guarded:
     never throws. */
  await reconcileDerivedBudgetLines(supabase, tourId, workspaceId);

  const [
    phases,
    panelData,
    lineItemsRes,
    routingRes,
    sectionsRes,
    settingsRes,
    artistRes,
  ] =
    await Promise.all([
      computeTourPhases(supabase, tourId),
      getBudgetPanelData(supabase, tourId),
      supabase
        .from('budget_line_items')
        .select('*')
        .eq('tour_id', tourId)
        .eq('workspace_id', workspaceId)
        .order('section')
        .order('sort_order', { ascending: true })
        .order('category')
        .order('order_index', { ascending: true }),
      // #24 — venue_name + city so the per-show income brick can label each show
      // with its real venue instead of "Show N".
      supabase.from('routing').select('id, date, venue_name, city, day_type').eq('tour_id', tourId),
      // Budget redesign — section backbone + per-tour phase toggle.
      supabase
        .from('budget_sections')
        .select('*')
        .eq('tour_id', tourId)
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
      // select('*') is migration-tolerant — merch_cogs_pct (migration 201)
      // is read by the P&L but absent before the migration applies.
      supabase
        .from('budget_settings')
        .select('*')
        .eq('tour_id', tourId)
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
      // Fix 3 — artist identity for the context band (avatar + name).
      tour.artist_id
        ? supabase
            .from('artists')
            .select('id, name, branding, spotify_id, spotify_image_url')
            .eq('id', tour.artist_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const artistRow = artistRes.data as {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  } | null;
  const artistLogoUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;

  const sections = (sectionsRes.data ?? []) as BudgetSection[];
  const budgetSettings = settingsRes.data as Record<string, unknown> | null;
  const trackPhases = Boolean(budgetSettings?.track_phases);

  /* Stage 3 — P&L inputs (income + commissions) only fetched for the
     Summary tab. budget_income keys per show, so fetch by the tour's
     routing ids. */
  const routingIds = (routingRes.data ?? [])
    .map((r) => (r as { id?: string }).id)
    .filter((id): id is string => Boolean(id));
  let incomeRows: IncomeInput[] = [];
  let commissionRows: CommissionInput[] = [];
  // Phase 3 — the Budget grid's locked formula sections (commissions /
  // insurance / contingency / COGS) compute live from the same P&L inputs
  // as the Summary, so fetch them for the Budget tab too.
  if (tab === 'summary' || tab === 'budget') {
    const [incRes, commRes] = await Promise.all([
      routingIds.length
        ? supabase
            .from('budget_income')
            .select('*')
            .eq('workspace_id', workspaceId)
            .in('routing_id', routingIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from('budget_commissions')
        .select('id, label, percentage, basis, order_index')
        .eq('tour_id', tourId)
        .eq('workspace_id', workspaceId)
        .order('order_index', { ascending: true }),
    ]);
    incomeRows = (incRes.data ?? []) as unknown as IncomeInput[];
    commissionRows = (commRes.data ?? []) as unknown as CommissionInput[];
  }

  const phaseBoundaries = phases.map((p) => ({
    key: p.key,
    label: p.label,
    startIso: p.startDate,
  }));
  const tourCurrency = (tour.currency as string | null) ?? 'GBP';
  // BUD-50 fix — Income is prop-fed (server-fetched here, like Expenses) rather
  // than client-fetched, so it renders synchronously and can't get stuck on a
  // client fetch that never commits. Same merge lib as the GET route.
  const initialIncome = workspaceId
    ? toIncomeRows(await loadTourIncome(supabase, tourId, workspaceId))
    : [];
  /* Budget Phase A §A2 — enrich every line with effective_actual_cost
     + transaction_count. Sum of transactions overrides actual_cost
     when present (§A1 derivation rule). One extra round-trip; cheap
     because we only fetch (line_item_id, amount). */
  const rawLines = (lineItemsRes.data ?? []) as BudgetLineItem[];
  // P0 — the two enrichment round-trips must never crash the budget page; on a
  // failure degrade to the un-enriched lines (zeroed aggregate fields) + log.
  const txnEnriched = await enrichLinesWithTransactionAggregates(
    supabase,
    rawLines,
  ).catch((err) => {
    logServerError('enrichLinesWithTransactionAggregates failed', err, { tourId });
    return rawLines.map((l) => ({ ...l, transaction_sum: 0, transaction_count: 0 }));
  });
  // Phase 3 Step 5 — also attach attachment_count for the grid's 📎 cell.
  const lines: BudgetLineItem[] = await enrichLinesWithAttachmentCounts(
    supabase,
    txnEnriched,
  ).catch((err) => {
    logServerError('enrichLinesWithAttachmentCounts failed', err, { tourId });
    return txnEnriched.map((l) => ({ ...l, attachment_count: 0 }));
  });

  /* VIS-BG-04 — display-only vendor label per line (single-else-"Multiple").
     Separate READ from the money path; degrades to blank on failure. */
  const vendorByLine: Record<string, string> = {};
  {
    const vmap = await fetchLineVendors(
      supabase,
      lines.map((l) => l.id),
    ).catch((err) => {
      logServerError('fetchLineVendors failed', err, { tourId });
      return new Map<string, string>();
    });
    for (const [id, v] of vmap) vendorByLine[id] = v;
  }

  /* Versioning (B1) — the proposed shown is the ACTIVE VERSION's snapshot, not
     the legacy budget_line_items.proposed_cost column (kept write-through one
     release as a fallback; never read). Actuals stay on the line. Overlay here so
     every downstream surface (grid / classic / summary / income) reads the
     versioned proposed. No-op until the snapshot exists (212 backfills v1). */
  const activeVersion = await resolveActiveVersion(supabase, tourId, workspaceId);
  // B2 — version selector list + approver capability + the VIEWED version (the
  // active head by default, or `?version=` for read-only history). Only a DRAFT
  // is editable; anything else (approved / superseded / a non-head view) is
  // version-locked.
  const [{ data: versionRows }, { data: canApproveRaw }] = await Promise.all([
    supabase
      .from('budget_versions')
      .select('id, version_number, status, note, approved_by, approved_at, parent_version_id')
      .eq('tour_id', tourId)
      .eq('workspace_id', workspaceId)
      .order('version_number', { ascending: true }),
    supabase.rpc('is_budget_approver'),
  ]);
  const versions = (versionRows ?? []) as unknown as BudgetVersionVm[];
  const canApprove = Boolean(canApproveRaw);
  // State-fix B1 — ONE viewed version, resolved once + threaded to every tab.
  // Default landing = the approved Current (the signed-off baseline) if one
  // exists, else the editable draft head. `?version=` overrides for read-only
  // history. The draft head (if any) is the editable working copy.
  const approvedVersion = versions.find((v) => v.status === 'approved') ?? null;
  const draftHead = activeVersion?.status === 'draft' ? activeVersion : null;
  const defaultViewed = approvedVersion ?? activeVersion;
  const requestedVersionId = typeof sp.version === 'string' ? sp.version : undefined;
  const viewed =
    (requestedVersionId && versions.find((v) => v.id === requestedVersionId)) || defaultViewed;
  const versionLocked = !!viewed && viewed.status !== 'draft';
  const viewedStatus = viewed?.status ?? 'draft';
  const draftVersionId = draftHead?.id ?? null;

  if (viewed) {
    const proposedByLine = await getProposedLineMap(supabase, viewed.id);
    for (const l of lines) {
      const p = proposedByLine.get(l.id);
      if (p !== undefined) (l as { proposed_cost: number }).proposed_cost = p;
    }
    const proposedIncome = await getProposedIncomeMap(supabase, viewed.id);
    for (const row of initialIncome) {
      const pi = proposedIncome.get(row.routing_id);
      if (pi) {
        row.pre_tax_guarantee = pi.pre_tax_guarantee;
        row.withholding_pct = pi.withholding_pct;
        row.pre_tax_overage = pi.pre_tax_overage;
        row.merch_income = pi.merch_income;
        row.vip_income = pi.vip_income;
        // #28 — overlay the override flags so a viewed version shows which
        // outputs were hand-entered (read-only here; the non-draft lock applies).
        row.overage_is_override = pi.overage_is_override;
        row.merch_is_override = pi.merch_is_override;
        row.vip_is_override = pi.vip_is_override;
        row.currency = pi.currency;
        // Phase 3 — overlay the projection inputs from the version snapshot.
        row.capacity = pi.capacity;
        row.est_sell_thru = pi.est_sell_thru;
        row.face_value = pi.face_value;
        row.deal_type = pi.deal_type;
        row.deal_pct = pi.deal_pct;
        row.deal_threshold = pi.deal_threshold;
        row.deal_pct_above = pi.deal_pct_above;
        row.dollars_per_head = pi.dollars_per_head;
        row.merch_fee_pct = pi.merch_fee_pct;
        row.vip_tickets = pi.vip_tickets;
        row.vip_price = pi.vip_price;
      }
    }
  }

  // Phase 2 — per-tour FX map (1 currency = rate tour-ccy) for the P&L + the
  // income grid's currency picker. Unversioned (a conversion assumption).
  const fxRates = await loadTourFxRates(supabase, tourId, workspaceId);

  const routingDateById: Record<string, string> = {};
  // #24 — routing_id → show label (venue → city → date) for the per-show brick.
  const routingLabelById: Record<string, string> = {};
  // Stage-3 parity — routing_id → day_type, for the grid's day-type pill.
  const dayTypeByRouting: Record<string, string> = {};
  for (const r of (routingRes.data ?? []) as Array<{
    id: string;
    date: string | null;
    venue_name?: string | null;
    city?: string | null;
    day_type?: string | null;
  }>) {
    if (!r.id) continue;
    if (r.date) routingDateById[r.id] = r.date.slice(0, 10);
    if (r.day_type) dayTypeByRouting[r.id] = r.day_type;
    const label =
      r.venue_name?.trim() ||
      r.city?.trim() ||
      (r.date ? new Date(`${r.date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '');
    if (label) routingLabelById[r.id] = label;
  }
  // Aligned to incomeRows by index (each carries routing_id at runtime).
  const showLabels = incomeRows.map(
    (row) => routingLabelById[(row as { routing_id?: string }).routing_id ?? ''] ?? null,
  );

  // FX unify (Stage 2) — foreign currencies used in the budget that have NO
  // budget_fx_rates entry convert 1:1 (a flagged fallback). Surface them via a
  // warning banner rather than silently mis-totalling the P&L.
  const fxTour = tourCurrency.toUpperCase();
  const fxUsed = new Set<string>();
  for (const l of lines) {
    const c = (l.currency ?? '').toUpperCase();
    if (c) fxUsed.add(c);
  }
  for (const i of incomeRows) {
    const c = ((i as { currency?: string | null }).currency ?? '').toUpperCase();
    if (c) fxUsed.add(c);
  }
  const fxMissing = [...fxUsed].filter((c) => c && c !== fxTour && fxRates[c] == null).sort();

  return (
    /* §B4 — BudgetDensityProvider wraps the whole budget page
       so the tab nav's density toggle + the grid + slide-over
       (when mounted) all share the same per-device preference. */
    <BudgetDensityProvider>
    <BudgetTrackPhasesProvider tourId={tourId} initial={trackPhases}>
    <div className="flex min-h-0 flex-1 flex-col pb-24">
        {/* Fix 3 — Band 2: tour identity + Summary/Expenses/Income tabs +
            display-currency/Export/Reports/Settings in one row (sticky),
            collapsing the old separate sub-bar + tour-header layers. */}
        <BudgetContextBand
          artistName={artistRow?.name ?? null}
          artistLogoUrl={artistLogoUrl}
          tourName={(tour.name as string | null) ?? 'Tour'}
          tourCurrency={tourCurrency}
          lines={lines}
          tourId={tourId}
          versions={versions}
          viewedVersionId={viewed?.id ?? null}
          canApprove={canApprove}
        />
        <BudgetBurnBar lines={lines} tourCurrency={tourCurrency} fxRates={fxRates} />
        <FxMissingRateBanner
          missing={fxMissing}
          tourCurrency={tourCurrency}
          settingsHref={`/budget/${tourId}?tab=settings`}
        />
        {/* Phase strip when this tour tracks phases (BUD-18). Phase 4.2 —
            the gate reads the shared track-phases context so the Settings
            toggle animates this strip without a router.refresh. */}
        <BudgetPhaseStripGate>
          <BudgetPhaseStripClient phases={phases} />
        </BudgetPhaseStripGate>

        {/* Phase 0 — content top matches the section rhythm so the grid isn't
            jammed under the sticky band/burn/phase stack. */}
        <div className="space-y-6 px-4 pt-6">
          {tab === 'summary' ? (
            /* #29 — the Summary tab is now the customizable card dashboard.
               Presentation-only over computeBudgetPnl (same figures as before). */
            <BudgetSummaryDashboard
              lines={lines}
              sections={sections}
              income={incomeRows}
              commissions={commissionRows}
              settings={budgetSettings}
              tourCurrency={tourCurrency}
              fxRates={fxRates}
              showLabels={showLabels}
            />
          ) : null}

          {tab === 'budget' ? (
            lines.length === 0 && sections.length === 0 ? (
              /* Phase B — no sections + no lines: scaffold from a
                 template instead of showing a blank grid. */
              <BudgetEmptyState tourId={tourId} />
            ) : (
              <>
                {/* Phase 3 — the canonical <Grid> is mounted on the REAL
                    budget data behind a "Grid (beta)" toggle; the classic
                    BudgetSpreadsheetView stays the default safety net until
                    the grid is live-verified, then this flips. */}
                <BudgetGridToggle
                  classic={
                    <BudgetSpreadsheetView
                      lines={lines}
                      sections={sections}
                      trackPhases={trackPhases}
                      phases={phases}
                      routingDateById={routingDateById}
                      duplicateMap={duplicatesToRecord(detectDuplicates(lines))}
                      tourCurrency={tourCurrency}
                      tourId={tourId}
                      fxRates={fxRates}
                      income={incomeRows}
                      commissions={commissionRows}
                      settings={budgetSettings}
                      receiptSlot={<ReceiptInbox tourId={tourId} tourCurrency={tourCurrency} lineItems={lines} />}
                    />
                  }
                  grid={
                    <BudgetGridView
                      lines={lines}
                      sections={sections}
                      tourCurrency={tourCurrency}
                      tourId={tourId}
                      versionLocked={versionLocked}
                      lockedVersionId={viewed?.id ?? null}
                      canApprove={canApprove}
                      viewedStatus={viewedStatus}
                      draftVersionId={draftVersionId}
                      versions={versions}
                      fxRates={fxRates}
                      duplicateMap={duplicatesToRecord(detectDuplicates(lines))}
                      dayTypeByRouting={dayTypeByRouting}
                      vendorByLine={vendorByLine}
                      trackPhases={trackPhases}
                    />
                  }
                />
              </>
            )
          ) : null}

          {/* Stage 3 Phase 2 — per-show income (feeds the Summary P&L).
              Migrated onto the canonical <Grid> (BUD-50). The legacy
              BudgetIncomeTab is retained, unmounted, as a fallback until the
              P&L parity is live-verified — remove it then. */}
          {tab === 'income' ? (
            <BudgetIncomeGrid
              tourId={tourId}
              tourCurrency={tourCurrency}
              initialRows={initialIncome}
              versionLocked={versionLocked}
              lockedVersionId={viewed?.id ?? null}
              canApprove={canApprove}
              viewedStatus={viewedStatus}
              draftVersionId={draftVersionId}
              versions={versions}
              fxRates={fxRates}
              projectionDefaults={{
                sellThru: budgetSettings?.default_sell_thru != null ? Number(budgetSettings.default_sell_thru) : null,
                dollarsPerHead: budgetSettings?.default_dollars_per_head != null ? Number(budgetSettings.default_dollars_per_head) : null,
                merchFeePct: budgetSettings?.default_merch_fee_pct != null ? Number(budgetSettings.default_merch_fee_pct) : null,
                // #24 — feed the formula-overage reference the tour's real config.
                haircut: budgetSettings?.overage_haircut != null ? Number(budgetSettings.overage_haircut) : null,
                taxPct: budgetSettings?.overage_tax_pct != null ? Number(budgetSettings.overage_tax_pct) : null,
              }}
            />
          ) : null}

          {/* Budget Phase A §A2 / Phase 0 — Actuals + Reports tabs removed.
              The grid shows Proposed / Actual / Variance per row; export lives
              on the context band. Stale ?tab=actuals|reports resolve to
              budget|summary via resolveBudgetTab (no 404). */}

          {tab === 'settings' ? (
            <BudgetSettingsTab
              tourId={tourId}
              tourCurrency={tourCurrency}
              sections={sections}
              versions={versions}
              viewedVersionId={viewed?.id ?? null}
              canApprove={canApprove}
            />
          ) : null}
        </div>

        <MobileBudgetBanner />
    </div>
    </BudgetTrackPhasesProvider>
    </BudgetDensityProvider>
  );
}
