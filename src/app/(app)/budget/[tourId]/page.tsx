/* ============================================
   LOWPASS — Budget · Tour landing (Phase 3 §A migration)

   /budget/[tourId] — replaces /tours/[id]/budget. Wraps the existing
   PR #6 + fix-up budget hub (Phase Context strip, Macro Allocation
   donut, Burn Rate chart, line-item table, Receipt Inbox, export
   controls, duplicate detection) inside <ProductShell>.

   Phase 3 §A is the migration commit only — no visual restructure
   yet. §B applies the dense spreadsheet template, §C splits the
   surface into Summary / Budget tabs, §D wires phase tagging.

   TourBreadcrumb (the legacy per-page chrome) retires here —
   <ProductHeader> from shell-v2 carries artist · tour context.
   The Phase Context strip stays at the top of the page body
   because it's per-tour-phase context, not navigation chrome.
   ============================================ */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import { ProductShell } from '@/components/shell-v2';
import { MobileBudgetBanner } from '@/components/mobile/MobileBudgetBanner';
import { BudgetPhaseStripClient } from '@/components/budget/BudgetPhaseStripClient';
import { BudgetOverviewPanels } from '@/components/budget/BudgetOverviewPanels';
import { BudgetStatsStrip } from '@/components/budget/BudgetStatsStrip';
import { BudgetSpreadsheetView } from '@/components/budget/BudgetSpreadsheetView';
import { ReceiptInbox } from '@/components/budget/ReceiptInbox';
import { BudgetExportControls } from '@/components/budget/BudgetExportControls';
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
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name, workspace_id, currency, artist_id')
    .eq('id', tourId)
    .single();

  if (tourErr || !tour) {
    notFound();
  }

  const workspaceId = tour.workspace_id as string;

  const [phases, panelData, lineItemsRes, routingRes] = await Promise.all([
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

  return (
    <ProductShell
      active="budget"
      artistId={(tour.artist_id as string | null) ?? null}
      tourId={tourId}
      productName="Budget"
    >
      <div className="flex min-h-0 flex-1 flex-col pb-24">
        {/* Phase 3 §B.1 — sticky stats strip lives ABOVE the §C tab
            nav so it stays visible regardless of which tab is open. */}
        <BudgetStatsStrip lines={lines} tourCurrency={tourCurrency} />
        <BudgetPhaseStripClient phases={phases} />
        <div className="space-y-6 px-4 pt-4">
          <BudgetExportControls
            lines={lines}
            tourCurrency={tourCurrency}
            tourName={(tour.name as string | null) ?? 'Budget'}
          />
          {/* Phase 3 §C will move BudgetOverviewPanels onto a dedicated
              Summary tab. Until §C lands, leaving it visible here keeps
              the user's existing Macro Allocation + Burn Rate context. */}
          <BudgetOverviewPanels
            allocation={panelData.allocation}
            burn={panelData.burn}
            phaseBoundaries={phaseBoundaries}
            currency={tourCurrency}
          />
          {/* Phase 3 §B.2 + §D — dense spreadsheet replaces the prior
              BudgetMainTable. Carries forward Quick Add, status chips,
              bulk select, multi-currency, slide-over editing,
              duplicate-detection banner. */}
          <BudgetSpreadsheetView
            lines={lines}
            phases={phases}
            routingDateById={routingDateById}
            duplicateMap={duplicatesToRecord(detectDuplicates(lines))}
            tourCurrency={tourCurrency}
            tourId={tourId}
          />
          <ReceiptInbox tourId={tourId} lineItems={lines} />
        </div>
        <MobileBudgetBanner />
      </div>
    </ProductShell>
  );
}
