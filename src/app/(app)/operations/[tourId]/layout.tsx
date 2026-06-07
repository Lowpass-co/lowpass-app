/* ============================================
   LOWPASS — Sprint 8.1 §2 — /operations/[tourId] layout

   Hoists <ProductShell> + <TourHeader> from each page.tsx into
   one shared layout so the <ArtistTourSwitcher> wrapper persists
   across same-product navigation (root → personnel → routing →
   …) and across [tourId] changes (A → B). The wrapper's open-
   state previously got reset because each page mounted its own
   ProductShell instance.

   Sub-routes' page.tsx files render only their body content;
   chrome (rail + header + tour identity strip) is here.

   Sprint 8.2 §1 — the per-product currentTourKeyStat third
   dot-segment was dropped from the switcher trigger after Adam's
   smoke ("PASS BUT the info is irrelevant. remove it."). The
   layout no longer threads a keyStat string — TourHeader still
   renders the equivalent info on its stats line beneath the
   tour name.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { ProductShell } from '@/components/shell-v2';
import { TourHeader } from '@/components/shell-v2/TourHeader';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { OperationsSubNavClient } from '@/components/operations/OperationsSubNavClient';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import {
  canAccess,
  fetchActiveGrants,
  getActiveMembership,
} from '@/lib/permissions/server';

/* Sprint 9 §14.11 — single source of truth for the Operations
   sub-nav links. Mirrors the per-page SUB_NAV constant the
   summary / personnel / routing pages used to declare locally;
   hoisting here means placeholder pages get the sub-nav for
   free + the active highlight follows pathname. */
const SUB_NAV: ReadonlyArray<{
  id: string;
  label: string;
  slug: string;
  resource_id: string;
}> = [
  { id: 'personnel', label: 'Tour Personnel', slug: 'personnel', resource_id: 'operations.personnel' },
  { id: 'routing', label: 'Routing', slug: 'routing', resource_id: 'operations.routing' },
  { id: 'channel-list', label: 'Channel list', slug: 'channel-list', resource_id: 'operations.channel_list' },
  { id: 'stage-plot', label: 'Stage Plot', slug: 'stage-plot', resource_id: 'operations.stage_plot' },
  { id: 'payroll', label: 'Payroll', slug: 'payroll', resource_id: 'operations.payroll' },
  { id: 'rooming', label: 'Rooming', slug: 'rooming', resource_id: 'operations.rooming' },
  { id: 'files', label: 'Files', slug: 'files', resource_id: 'operations.files' },
  { id: 'riders', label: 'Riders', slug: 'riders', resource_id: 'operations.riders' },
];

export default async function OperationsTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: tour } = await supabase
    .from('tours')
    .select(
      'id, name, artist_id, start_date, end_date, band_count, crew_count, principal_count',
    )
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    name: string;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
    band_count: number | null;
    crew_count: number | null;
    principal_count: number | null;
  };

  const [artistRes, routingCountRes] = await Promise.all([
    tourRow.artist_id
      ? supabase
          .from('artists')
          .select('id, name, branding, spotify_id, spotify_image_url')
          .eq('id', tourRow.artist_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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

  // Crew total = principals + band + crew (schema splits them).
  const crewCount =
    (tourRow.band_count ?? 0) +
    (tourRow.crew_count ?? 0) +
    (tourRow.principal_count ?? 0);

  /* Sprint 9 §14.11 — build sub-nav links once at the layout
     level. Summary entry leads, then each sub-page link gated
     by per-resource read access. Layout fetches membership +
     grants now (was per-page); the page-level constructions
     can drop their own SUB_NAV mounts but leaving them in
     place is harmless — the layout's instance is the
     persistent one and renders identical chrome regardless. */
  const membership = user ? await getActiveMembership(supabase, user.id) : null;
  const grants = membership && user ? await fetchActiveGrants(supabase, membership, user.id) : [];
  const subNavLinks = [
    {
      id: 'summary',
      label: 'Summary',
      slug: '',
      href: `/operations/${tourId}`,
      visible: true,
    },
    ...SUB_NAV.map((s) => ({
      id: s.id,
      label: s.label,
      slug: s.slug,
      visible: membership
        ? canAccess(membership, grants, 'page', s.resource_id, 'read')
        : false,
    })),
  ];

  return (
    <ProductShell
      active="operations"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Operations"
      subNav={<OperationsSubNavClient tourId={tourId} links={subNavLinks} />}
    >
      {artistRow ? (
        <TourHeader
          artistId={artistRow.id}
          artistName={artistRow.name}
          artistLogoUrl={artistLogoUrl}
          tourId={tourId}
          tourName={tourRow.name}
          startDate={tourRow.start_date}
          endDate={tourRow.end_date}
          product="operations"
          stats={{
            showCount: routingCountRes.count ?? null,
            crewCount: crewCount > 0 ? crewCount : null,
            // legCount sourced from flight-legs table when that
            // surface lands — deferred. TourHeader gracefully
            // omits empty fields from the stats line.
            legCount: null,
          }}
        />
      ) : null}
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
