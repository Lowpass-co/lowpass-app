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
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { OperationsGroupSubNav } from '@/components/operations/OperationsGroupSubNav';
import { TourIdentityBand } from '@/components/operations/TourIdentityBand';
import { resolveArtistLogoUrl } from '@/lib/artists/imageUrl';
import { tourPhase } from '@/lib/derive/tourStatus';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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
    .select('id, name, artist_id, start_date, end_date, status')
    .eq('id', tourId)
    .maybeSingle();

  if (!tour) notFound();

  const tourRow = tour as {
    id: string;
    name: string;
    artist_id: string | null;
    start_date: string | null;
    end_date: string | null;
    status: string | null;
  };

  /* G2-1 — identity band (avatar · artist · tour · status) for the Crew group.
     Fetch the artist for the avatar + name and derive the tour status; the band
     self-hides on non-Crew ops pages until G2-4 rolls it out. */
  const { data: artist } = tourRow.artist_id
    ? await supabase
        .from('artists')
        .select('id, name, branding, spotify_id, spotify_image_url')
        .eq('id', tourRow.artist_id)
        .maybeSingle()
    : { data: null };
  const artistRow = artist as { id: string; name: string; branding: unknown; spotify_id: string | null; spotify_image_url: string | null } | null;
  const avatarUrl = artistRow ? await resolveArtistLogoUrl(artistRow) : null;
  const today = new Date().toISOString().slice(0, 10);
  const phase = tourPhase({ start_date: tourRow.start_date, end_date: tourRow.end_date, status: tourRow.status }, today);
  const STATUS_LABEL: Record<string, string> = { on_tour: 'On tour', upcoming: 'Upcoming', planning: 'Planning', ended: 'Ended' };

  /* Stage B — the sub-nav is now a group-scoped segmented control (Crew /
     Production only), so the layout no longer needs artist identity for a
     context band; tour identity persists in the header's switcher pills.
     Access-gate each ops sub-page by per-resource read access — the segmented
     control drops any member the caller can't read. */
  const membership = user ? await getActiveMembership(supabase, user.id) : null;
  const grants = membership && user ? await fetchActiveGrants(supabase, membership, user.id) : [];
  const subNavLinks = SUB_NAV.map((s) => ({
    id: s.id,
    label: s.label,
    slug: s.slug,
    visible: membership
      ? canAccess(membership, grants, 'page', s.resource_id, 'read')
      : false,
  }));

  return (
    <ProductShell
      active="operations"
      artistId={tourRow.artist_id}
      tourId={tourId}
      productName="Operations"
      subNav={
        <>
          <TourIdentityBand
            tourId={tourId}
            artistName={artistRow?.name ?? 'Artist'}
            avatarUrl={avatarUrl}
            tourName={tourRow.name}
            statusLabel={STATUS_LABEL[phase] ?? ''}
            statusKey={phase}
          />
          <OperationsGroupSubNav tourId={tourId} links={subNavLinks} />
        </>
      }
    >
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
