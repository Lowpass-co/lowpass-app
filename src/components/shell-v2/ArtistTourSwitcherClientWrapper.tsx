/* ============================================
   LOWPASS — Sprint 5 §2 + §3 — <ArtistTourSwitcherClientWrapper>

   Thin client component that owns the [isCreateTourOpen] state
   so <ProductHeader> (a server component) can mount the
   switcher + the new-tour slide-over together. Phase 3 swapped
   the placeholder for the real <TourCreateSlideOver>.
   ============================================ */

'use client';

import { useState } from 'react';
import { ArtistTourSwitcher } from './ArtistTourSwitcher';
import { TourCreateSlideOver } from './TourCreateSlideOver';

type ArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

type TourMin = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
};

interface ArtistTourSwitcherClientWrapperProps {
  initialArtists: ArtistMin[];
  initialTours: TourMin[] | null;
}

export function ArtistTourSwitcherClientWrapper({
  initialArtists,
  initialTours,
}: ArtistTourSwitcherClientWrapperProps) {
  const [isCreateTourOpen, setIsCreateTourOpen] = useState(false);

  return (
    <>
      <ArtistTourSwitcher
        initialArtists={initialArtists}
        initialTours={initialTours}
        onCreateTour={() => setIsCreateTourOpen(true)}
      />
      <TourCreateSlideOver
        open={isCreateTourOpen}
        onClose={() => setIsCreateTourOpen(false)}
      />
    </>
  );
}
