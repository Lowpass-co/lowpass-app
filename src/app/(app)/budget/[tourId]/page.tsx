/* ============================================
   LOWPASS — Budget · Tour landing (Phase 3 §C tab nav)

   /budget/[tourId] — wraps the budget hub in <ProductShell> with
   five tabs (Summary / Budget / Actuals / Reports / Settings).
   Tab state via ?tab= searchParam; Summary is the default.

   Layout (top → bottom):
     <ProductShell>
       <BudgetStatsStrip>          (sticky — always visible)
       <BudgetPhaseStripClient>    (sticky — phase context)
       <BudgetTabNav>              (active tab from ?tab=)
       <tab-content>               (Summary | Budget | Actuals | Reports | Settings)
     </ProductShell>

   Summary tab carries the big-picture surface (charts, variance,
   top spend, recent activity). Budget tab carries the dense
   line-item spreadsheet from §B + Receipt Inbox sidebar. Other
   three are placeholders this sprint.
   ============================================ */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ProductShell } from '@/components/shell-v2';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { MobileBudgetBanner } from '@/components/mobile/MobileBudgetBanner';
import { BudgetPhaseStripClient } from '@/components/budget/BudgetPhaseStripClient';
import { BudgetStatsStrip } from '@/components/budget/BudgetStatsStrip';
import { BudgetSpreadsheetView } from '@/components/budget/BudgetSpreadsheetView';
import { ReceiptInbox } from '@/components/budget/ReceiptInbox';
import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
// Hotfix 3 §1 — resolveBudgetTab is a server-safe pure helper now,
// imported directly from the utils module. The BudgetTabNav React
// component itself is a client component and stays imported from
// its own file (it's referenced as JSX, which doesn't cross the
// server→client function-call boundary).
import { BudgetTabNav } from '@/components/budget/BudgetTabNav';
import { resolveBudgetTab } from '@/components/budget/budget-tab-utils';
import { BudgetSummaryTab } from '@/components/budget/BudgetSummaryTab';
import { BudgetTabPlaceholder } from '@/components/budget/BudgetTabPlaceholder';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeTourPhases } from '@/server/budget/computeTourPhases';
import { getBudgetPanelData } from '@/server/budget/getBudgetPanelData';
import {
  detectDuplicates,
  duplicatesToRecord,
} from '@/server/budget/detectDuplicates';
import type { BudgetLineItem } from '@/types';

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

  const [phases, panelData, lineItemsRes, routingRes, artistRes] = await Promise.all([
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
    // Sprint 7 §3 — artist row needed for the new <TourHeader>.
    tour.artist_id
      ? supabase
          .from('artists')
          .select('id, name, branding, spotify_id, spotify_image_url')
          .eq('id', tour.artist_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const phaseBoundaries = phases.map((p) => ({
    key: p.key,
    label: p.label,
    startIso: p.startDate,
  }));
  const tourCurrency = (tour.currency as string | null) ?? 'GBP';
  const lines: BudgetLineItem[] = (lineItemsRes.data ?? []) as BudgetLineItem[];
  const routingDateById: Record<string, string> = {};
  for (const r of (routingRes.data ?? []) as Array<{
    id: string;
    date: string | null;
  }>) {
    if (r.id && r.date) routingDateById[r.id] = r.date.slice(0, 10);
  }

  // Sprint 7 §3 — TourHeader data prep.
  const artistRow = artistRes.data as {
    id: string;
    name: string;
    branding: unknown;
    spotify_id: string | null;
    spotify_image_url: string | null;
  } | null;
  const artistLogoUrl = artistRow
    ? await resolveArtistLogoUrl(artistRow)
    : null;
  const showCount = Array.isArray(routingRes.data)
    ? routingRes.data.length
    : 0;
  // Budget total + spent percent — sum the line items'
  // proposed_cost (the budget number) and actual_cost (spent
  // so far). Both are numeric in the schema; null-coalesce to
  // 0 for safety.
  const budgetTotal = lines.reduce(
    (sum, l) => sum + (Number(l.proposed_cost) || 0),
    0,
  );
  const spentTotal = lines.reduce(
    (sum, l) => sum + (Number(l.actual_cost) || 0),
    0,
  );
  const spentPercent =
    budgetTotal > 0 ? (spentTotal / budgetTotal) * 100 : null;

  return (
    <ProductShell
      active="budget"
      artistId={(tour.artist_id as string | null) ?? null}
      tourId={tourId}
      productName="Budget"
    >
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourId}
          tourName={(tour.name as string | null) ?? 'Tour'}
          startDate={(tour.start_date as string | null) ?? null}
          endDate={(tour.end_date as string | null) ?? null}
          product="budget"
          stats={{
            showCount,
            budgetTotal,
            budgetCurrency: tourCurrency,
            spentPercent,
          }}
        />
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col pb-24">
        <BudgetStatsStrip lines={lines} tourCurrency={tourCurrency} />
        <BudgetPhaseStripClient phases={phases} />
        <BudgetTabNav active={tab} />

        <div className="space-y-6 px-4 pt-4">
          {tab === 'summary' ? (
            <BudgetSummaryTab
              tourId={tourId}
              lines={lines}
              allocation={panelData.allocation}
              burn={panelData.burn}
              phaseBoundaries={phaseBoundaries}
              tourCurrency={tourCurrency}
            />
          ) : null}

          {tab === 'budget' ? (
            <>
              {/* Export controls live above the spreadsheet so PDF/
                  XLSX is reachable from the line-item surface itself
                  (Reports tab also links to it). */}
              <BudgetExportControls
                lines={lines}
                tourCurrency={tourCurrency}
                tourName={(tour.name as string | null) ?? 'Budget'}
              />
              <BudgetSpreadsheetView
                lines={lines}
                phases={phases}
                routingDateById={routingDateById}
                duplicateMap={duplicatesToRecord(detectDuplicates(lines))}
                tourCurrency={tourCurrency}
                tourId={tourId}
              />
              <ReceiptInbox tourId={tourId} lineItems={lines} />
            </>
          ) : null}

          {tab === 'actuals' ? (
            <BudgetTabPlaceholder
              subtitle="Budget · actuals"
              title="Actuals"
              body="A filtered view of paid + closed line items, with per-show actuals tied back to estimates. Ships in a follow-up sprint. For now, switch to the Budget tab and filter by status = paid."
              linkLabel="Open Budget tab"
              linkHref={`/budget/${tourId}?tab=budget`}
            />
          ) : null}

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
            <BudgetTabPlaceholder
              subtitle="Budget · settings"
              title="Settings"
              body="Per-tour budget settings (categories, currency, contingency %) will live here. The tour's currency is editable from the tour edit page today."
              linkLabel="Open tour settings"
              linkHref={`/operations/${tourId}/edit`}
            />
          ) : null}
        </div>

        <MobileBudgetBanner />
      </div>
    </ProductShell>
  );
}
