/* ============================================
   LOWPASS — Budget hub (Phase A budget redesign)

   Restructured to the new variant-inspired hub: TourPhaseContextStrip
   pinned at the top, then macro/burn-rate panels (Phase B), then the
   main DataTable view (Phase C), then receipt inbox (Phase D), then
   smart features (Phase E) and currency/export (Phase F).

   The existing TourBudgetRebuildClient (UX14 section editor) stays
   reachable as the inline-edit surface beneath the new chrome.

   When PR #3 (nav redesign) merges, mount <TourBreadcrumbServer
   tourId={tourId} /> as the first child of the wrapper div per the
   per-page mount convention — it can't live in tours/[id]/layout.tsx
   because PageShell's <main overflow:auto> scroll context breaks the
   sticky positioning.
   ============================================ */

import { notFound } from 'next/navigation';

import type { Metadata } from 'next';

import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { TourBudgetRebuildClient } from '@/components/budget/TourBudgetRebuildClient';
import { MobileBudgetBanner } from '@/components/mobile/MobileBudgetBanner';
import { BudgetPhaseStripClient } from '@/components/budget/BudgetPhaseStripClient';
import { BudgetOverviewPanels } from '@/components/budget/BudgetOverviewPanels';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { computeTourPhases } from '@/server/budget/computeTourPhases';
import { getBudgetPanelData } from '@/server/budget/getBudgetPanelData';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const { data: tour } = await supabase.from('tours').select('name').eq('id', id).single();
  return { title: tour?.name ? `${tour.name} — Budget` : 'Budget' };
}

export default async function TourBudgetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, workspace_id, currency')
    .eq('id', id)
    .single();

  if (tourErr || !tour) {
    notFound();
  }

  const workspaceId = tour.workspace_id as string;

  const [phases, panelData, lineItemsRes] = await Promise.all([
    computeTourPhases(supabase, id),
    getBudgetPanelData(supabase, id),
    supabase
      .from('budget_line_items')
      .select('*')
      .eq('tour_id', id)
      .eq('workspace_id', workspaceId)
      .order('section')
      .order('sort_order', { ascending: true })
      .order('category')
      .order('order_index', { ascending: true }),
  ]);

  const phaseBoundaries = phases.map((p) => ({
    key: p.key,
    label: p.label,
    startIso: p.startDate,
  }));
  const tourCurrency = (tour.currency as string | null) ?? 'GBP';

  // TODO(UX14): once budget section list is treated as a rail, replace
  // topBarOnlyAppPageShell with spreadsheetAppPageShell + a section variant.
  return topBarOnlyAppPageShell(
    <div className="flex min-h-0 flex-1 flex-col pb-24">
      {/* TODO(post-PR#3): mount <TourBreadcrumbServer tourId={id} />
         here when the nav-redesign branch merges. */}
      <BudgetPhaseStripClient phases={phases} />
      <div className="px-4">
        <BudgetOverviewPanels
          allocation={panelData.allocation}
          burn={panelData.burn}
          phaseBoundaries={phaseBoundaries}
          currency={tourCurrency}
        />
      </div>
      <MobileBudgetBanner />
      <TourBudgetRebuildClient
        initialLines={lineItemsRes.data ?? []}
        tourDefaultCurrency={tourCurrency}
        tourId={id}
      />
    </div>,
  );
}
