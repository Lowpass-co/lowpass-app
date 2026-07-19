'use client';

/* ============================================
   LOWPASS — <HydrateTourArtist> (P0 context hydration)

   A tour URL (/operations|budget|advance/[tourId]) does NOT contain the artist
   id, so ArtistTourContext resolved the artist to null on a cold load and the
   top-bar picker sat on "Pick an artist…". The tour layouts know the artist
   server-side; this tiny client component feeds it into the context so the
   picker (and anything gated on selectedArtistId) hydrates without any user
   interaction. Renders nothing.
   ============================================ */

import { useEffect } from 'react';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

export function HydrateTourArtist({ tourId, artistId }: { tourId: string; artistId: string | null }) {
  const { provideTourArtist } = useArtistTourContext();
  useEffect(() => {
    if (artistId) provideTourArtist(tourId, artistId);
  }, [tourId, artistId, provideTourArtist]);
  return null;
}
