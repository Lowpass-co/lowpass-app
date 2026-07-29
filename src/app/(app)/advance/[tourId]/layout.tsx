/* ============================================
   LOWPASS — /advance/[tourId] layout

   Hoists <ProductShell> + the shared identity band from each page.tsx so the
   <ArtistTourSwitcher> wrapper persists across [routingId] navigation and across
   [tourId] changes.

   G2-4 — the per-page <TourHeader> variant (artist logo + tour + advance stats)
   is retired here in favour of the ONE app-wide <IdentityLockup> (same band as
   Operations + Budget). This also drops the ASYNC resolveArtistLogoUrl call that
   ran on every advance page — loadTourIdentity uses the DB-only resolver, so the
   layout never blocks on a live Spotify fetch. The advance modes stay the in-page
   segmented control; per-show status lives in the advance day UI.
   ============================================ */

import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { isShelledPath, hasOwnRail } from '@/lib/nav/ia';
import { ProductShell } from '@/components/shell-v2';
import { IdentityLockup } from '@/components/shell-v2/IdentityLockup';
import { HydrateTourArtist } from '@/components/shell-v2/HydrateTourArtist';
import { TourVisitTracker } from '@/components/shell-v2/TourVisitTracker';
import { loadTourIdentity } from '@/lib/shell/tourIdentity';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export default async function AdvanceTourLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const identity = await loadTourIdentity(supabase, tourId);
  if (!identity) notFound();

  /* S-2a — Advance is Tour mode, so it crosses to the canonical shell with the
     rest of Tour mode. The per-show surface (/advance/[tourId]/[routingId])
     carries the upcoming-shows day rail, so the app rail starts collapsed
     there; the tour-level overview has no day rail and keeps its width. */
  const h = await headers();
  const pathname = h.get('x-pathname') ?? `/advance/${tourId}`;
  const search = h.get('x-search') ?? '';

  if (isShelledPath(pathname, search)) {
    return (
      <ShellV3Mount
        pathname={pathname}
        search={search}
        artistId={identity.artistId}
        artistName={identity.artistName}
        tourName={identity.tourName}
        denseRail={hasOwnRail(pathname)}
      >
        <HydrateTourArtist tourId={tourId} artistId={identity.artistId} />
        <TourVisitTracker tourId={tourId} />
        {children}
      </ShellV3Mount>
    );
  }

  return (
    <ProductShell
      active="advance"
      artistId={identity.artistId}
      tourId={tourId}
      productName="Advance"
      subNav={
        <IdentityLockup
          artistName={identity.artistName}
          avatarUrl={identity.avatarUrl}
          tourName={identity.tourName}
          statusLabel={identity.statusLabel}
          statusKey={identity.statusKey}
        />
      }
    >
      <HydrateTourArtist tourId={tourId} artistId={identity.artistId} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ProductShell>
  );
}
