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
import { HydrateTourArtist } from '@/components/shell-v2/HydrateTourArtist';
import { OperationsGroupSubNav } from '@/components/operations/OperationsGroupSubNav';
import { TourIdentityBand } from '@/components/operations/TourIdentityBand';
import { loadTourIdentity } from '@/lib/shell/tourIdentity';
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

  /* F-3(b) — these were four SEQUENTIAL awaits on every tour-scoped page load:
     getUser → loadTourIdentity → getActiveMembership → fetchActiveGrants. Only
     the permission chain is genuinely ordered (membership needs the user, grants
     need the membership); the tour identity depends on neither, so it was paying
     for the other three round-trips for no reason. Run identity ALONGSIDE the
     permission chain — one round-trip saved on every operations page, and the
     saving is largest exactly where it hurt: a cold lambda.

     G2-4 — identity comes from the ONE shared loader (same band in Operations,
     Budget, Advance) and uses the DB-only logo resolver, so this never blocks on
     a live Spotify fetch. */
  const [identity, auth] = await Promise.all([
    loadTourIdentity(supabase, tourId),
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const membership = user ? await getActiveMembership(supabase, user.id) : null;
      const grants = membership && user ? await fetchActiveGrants(supabase, membership, user.id) : [];
      return { user, membership, grants };
    })(),
  ]);
  if (!identity) notFound();
  const { membership, grants } = auth;

  /* Stage B — the sub-nav is a group-scoped segmented control (Crew / Production
     only). Access-gate each ops sub-page by per-resource read access — the
     control drops any member the caller can't read. */
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
      artistId={identity.artistId}
      tourId={tourId}
      productName="Operations"
      subNav={
        <>
          <TourIdentityBand
            tourId={tourId}
            artistName={identity.artistName}
            avatarUrl={identity.avatarUrl}
            tourName={identity.tourName}
            statusLabel={identity.statusLabel}
            statusKey={identity.statusKey}
          />
          <OperationsGroupSubNav tourId={tourId} links={subNavLinks} />
        </>
      }
    >
      <HydrateTourArtist tourId={tourId} artistId={identity.artistId} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
