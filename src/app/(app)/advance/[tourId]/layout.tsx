/* ============================================
   LOWPASS — /advance/[tourId] layout

   Chrome for every Advance surface, mounted here so the picker and the rail
   survive [routingId] and [tourId] navigation.

   S-2d — the <ProductShell> branch and the identity band are gone: the top bar
   names the artist and the tour, so the band was saying it twice. The advance
   MODES stay where they were, as the in-page segmented control; per-show status
   lives in the advance day UI.

   loadTourIdentity uses the DB-only logo resolver, so this never blocks on a
   live Spotify fetch.
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

  const h = await headers();
  const pathname = h.get('x-pathname') ?? `/advance/${tourId}`;
  const search = h.get('x-search') ?? '';

  return (
    <ShellV3Mount
      pathname={pathname}
      search={search}
      artistId={identity.artistId}
      artistName={identity.artistName}
      tourName={identity.tourName}
      /* The per-show surface carries the upcoming-shows rail; the tour-level
         overview has none and keeps its width. */
      denseRail={hasOwnRail(pathname)}
    >
      <HydrateTourArtist tourId={tourId} artistId={identity.artistId} />
      <TourVisitTracker tourId={tourId} />
      {children}
    </ShellV3Mount>
  );
}
