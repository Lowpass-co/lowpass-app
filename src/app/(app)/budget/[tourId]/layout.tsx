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
import { IdentityLockup } from '@/components/shell-v2/IdentityLockup';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { loadTourIdentity } from '@/lib/shell/tourIdentity';
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

  // G2-4 — the ONE identity lockup (same component as Operations/Advance), above
  // the budget tab band, so the artist/tour band is identical across products.
  const identity = await loadTourIdentity(supabase, tourId);

  return (
    <ProductShell
      active="budget"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Budget"
      subNav={identity ? (
        <IdentityLockup
          artistName={identity.artistName}
          avatarUrl={identity.avatarUrl}
          tourName={identity.tourName}
          statusLabel={identity.statusLabel}
          statusKey={identity.statusKey}
        />
      ) : null}
    >
      {/* Budget tabs live in the page's <BudgetContextBand>; the identity band is
          now the shared IdentityLockup above (G2-4). */}
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
