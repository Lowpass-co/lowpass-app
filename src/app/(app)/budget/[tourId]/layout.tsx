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
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { SubNavStrip } from '@/components/shell/SubNavStrip';
import { budgetSubNavLinks } from '@/lib/shell/subNavLinks';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
} from '@/lib/permissions/server';
import type { BudgetLineItem } from '@/types';

export default async function BudgetTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  /* Sprint 10 §1.4 — fetch user + membership/grants for the
     SubNavStrip. Skip when unauth — SubNavStrip falls back to
     all-hidden. */
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const membership = user ? await getActiveMembership(supabase, user.id) : null;
  const grants =
    membership && user ? await fetchActiveGrants(supabase, membership, user.id) : [];

  const { data: tour } = await supabase
    .from('tours')
    .select(
      'id, name, workspace_id, currency, artist_id, start_date, end_date',
    )
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    name: string | null;
    workspace_id: string | null;
    currency: string | null;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
  };

  if (!tourRow.workspace_id) notFound();

  const [artistRes, lineItemsRes, routingCountRes] = await Promise.all([
    tourRow.artist_id
      ? supabase
          .from('artists')
          .select('id, name, branding, spotify_id, spotify_image_url')
          .eq('id', tourRow.artist_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from('budget_line_items')
      .select('proposed_cost, actual_cost')
      .eq('tour_id', tourId)
      .eq('workspace_id', tourRow.workspace_id),
    supabase
      .from('routing')
      .select('id', { count: 'exact', head: true })
      .eq('tour_id', tourId),
  ]);

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

  const lines = (lineItemsRes.data ?? []) as Pick<
    BudgetLineItem,
    'proposed_cost' | 'actual_cost'
  >[];
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

  const tourCurrency = tourRow.currency ?? 'GBP';

  const subNavLinks = budgetSubNavLinks(tourId, (resource) =>
    membership ? canAccess(membership, grants, 'page', resource, 'read') : false,
  );

  return (
    <ProductShell
      active="budget"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Budget"
    >
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourId}
          tourName={tourRow.name ?? 'Tour'}
          startDate={tourRow.start_date}
          endDate={tourRow.end_date}
          product="budget"
          stats={{
            showCount: routingCountRes.count ?? null,
            budgetTotal,
            budgetCurrency: tourCurrency,
            spentPercent,
          }}
        />
      ) : null}
      <SubNavStrip links={subNavLinks} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
