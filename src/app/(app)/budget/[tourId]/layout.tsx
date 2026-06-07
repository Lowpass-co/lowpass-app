/* ============================================
   LOWPASS — Sprint 8.1 §2 — /budget/[tourId] layout

   Hoists <ProductShell> + <TourHeader> from each page.tsx into
   one shared layout so the <ArtistTourSwitcher> wrapper persists
   across budget sub-route navigation (root → settlement) and
   across [tourId] changes (A → B).

   This layout nests inside the existing /budget/layout.tsx
   (BudgetDetailPanelLayout). Order: BudgetDetailPanelLayout →
   ProductShell → TourHeader → page body.

   Sprint 8.2 §1 — the per-product currentTourKeyStat third
   dot-segment was dropped from the switcher trigger. TourHeader
   still renders the spent % on its stats line beneath the
   tour name.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function BudgetTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  // Fix 3 — the tour identity + budget stats now render in the page's
  // <BudgetContextBand> / burn bar, so this layout only needs the tour
  // row to guard the route + scope the ProductShell. The artist / line /
  // routing fetches that fed the old TourHeader are gone.
  const { data: tour } = await supabase
    .from('tours')
    .select('id, workspace_id, artist_id')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    workspace_id: string | null;
    artist_id: string | null;
  };

  if (!tourRow.workspace_id) notFound();

  return (
    <ProductShell
      active="budget"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Budget"
    >
      {/* Fix 3 — the tour identity + sub-tabs now live in the page's
          <BudgetContextBand> (Band 2), so the separate TourHeader +
          BudgetSubBar layers are gone. */}
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
