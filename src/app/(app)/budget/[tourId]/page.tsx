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
import { enrichLinesWithTransactionAggregates } from '@/lib/budget/transactions';
import { enrichLinesWithAttachmentCounts } from '@/lib/budget/attachments';
import { loadTourIncome, toIncomeRows } from '@/lib/budget/income';
import { BudgetSummaryTab } from '@/components/budget/BudgetSummaryTab';
import { BudgetTabPlaceholder } from '@/components/budget/BudgetTabPlaceholder';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeTourPhases } from '@/server/budget/computeTourPhases';
import { getBudgetPanelData } from '@/server/budget/getBudgetPanelData';
import { reconcileDerivedBudgetLines } from '@/server/budget/reconcileDerivedLines';
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
    .single();
  return { title: tour?.name ? `${tour.name} — Budget` : 'Budget' };
}

export default async function BudgetTourPage({
  params,
  searchParams,
}: {
  params: Promise<{ tourId: string }>;
  searchParams: Promise<{ tab?: string }>;
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
      supabase.from('routing').select('id, date').eq('tour_id', tourId),
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
  const txnEnriched = await enrichLinesWithTransactionAggregates(
    supabase,
    rawLines,
  );
  // Phase 3 Step 5 — also attach attachment_count for the grid's 📎 cell.
  const lines: BudgetLineItem[] = await enrichLinesWithAttachmentCounts(
    supabase,
    txnEnriched,
  );
  const routingDateById: Record<string, string> = {};
  for (const r of (routingRes.data ?? []) as Array<{
    id: string;
    date: string | null;
  }>) {
    if (r.id && r.date) routingDateById[r.id] = r.date.slice(0, 10);
  }

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
        />
        <BudgetBurnBar lines={lines} tourCurrency={tourCurrency} />
        {/* Phase strip when this tour tracks phases (BUD-18). Phase 4.2 —
            the gate reads the shared track-phases context so the Settings
            toggle animates this strip without a router.refresh. */}
        <BudgetPhaseStripGate>
          <BudgetPhaseStripClient phases={phases} />
        </BudgetPhaseStripGate>

        <div className="space-y-6 px-4 pt-4">
          {tab === 'summary' ? (
            <BudgetSummaryTab
              tourId={tourId}
              lines={lines}
              sections={sections}
              income={incomeRows}
              commissions={commissionRows}
              settings={budgetSettings}
              allocation={panelData.allocation}
              burn={panelData.burn}
              phaseBoundaries={phaseBoundaries}
              tourCurrency={tourCurrency}
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
                      income={incomeRows}
                      commissions={commissionRows}
                      settings={budgetSettings}
                      receiptSlot={<ReceiptInbox tourId={tourId} lineItems={lines} />}
                    />
                  }
                  grid={
                    <BudgetGridView
                      lines={lines}
                      sections={sections}
                      tourCurrency={tourCurrency}
                      tourId={tourId}
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
            <BudgetIncomeGrid tourId={tourId} tourCurrency={tourCurrency} initialRows={initialIncome} />
          ) : null}

          {/* Budget Phase A §A2 — Actuals tab removed; the
              Budget grid now shows Proposed / Actual / Variance
              per row + per-section + tour-wide. Stale ?tab=actuals
              URLs resolve to 'summary' via resolveBudgetTab. */}

          {tab === 'reports' ? (
            <BudgetTabPlaceholder
              subtitle="Budget · reports"
              title="Reports"
              body="Custom reports and exports across the budget will live here. The existing PDF / XLSX export from the Budget tab is wired and reachable today."
              linkLabel="Open Budget tab + export"
              linkHref={`/budget/${tourId}?tab=budget`}
            />
          ) : null}

          {tab === 'settings' ? (
            <BudgetSettingsTab tourId={tourId} sections={sections} />
          ) : null}
        </div>

        <MobileBudgetBanner />
    </div>
    </BudgetTrackPhasesProvider>
    </BudgetDensityProvider>
  );
}
