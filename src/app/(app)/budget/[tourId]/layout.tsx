/* ============================================
   LOWPASS — /budget/[tourId] layout

   Chrome for Budget and Settlement, mounted here so the picker and the rail
   survive sub-route and [tourId] navigation.

   Nests inside /budget/layout.tsx (BudgetDetailPanelLayout). Order:
   BudgetDetailPanelLayout → ShellV3Mount → page body.

   S-2d — the <ProductShell> branch and the identity band are gone; the top bar
   carries artist and tour. The budget TABS went in S-2b, to the Money rail —
   BudgetContextBand keeps the version selector, density toggle and Export.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { hasOwnRail } from '@/lib/nav/ia';
import { HydrateTourArtist } from '@/components/shell-v2/HydrateTourArtist';
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

  const h = await headers();
  const pathname = h.get('x-pathname') ?? `/budget/${tourId}`;
  const search = h.get('x-search') ?? '';

  return (
    <ShellV3Mount
      pathname={pathname}
      search={search}
      artistId={identity?.artistId ?? tourRow.artist_id}
      artistName={identity?.artistName ?? null}
      tourName={identity?.tourName ?? null}
      denseRail={hasOwnRail(pathname)}
    >
      <HydrateTourArtist tourId={tourId} artistId={identity?.artistId ?? tourRow.artist_id} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ShellV3Mount>
  );
}
