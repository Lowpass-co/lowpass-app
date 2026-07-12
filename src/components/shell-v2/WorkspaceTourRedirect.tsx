'use client';

/* ============================================
   LOWPASS — WorkspaceTourRedirect (IA tour-flow fix §2)

   Generic client redirect for the workspace-level product landings
   (/operations, /advance, …). When the user lands on the tourless
   route but ArtistTourContext already has a selected tour, hard-replace
   to the tour-scoped route ({base}/{tourId}) so they skip the
   "select a tour" prompt. No tour selected → renders nothing and the
   prompt shows.

   Mirrors budget/BudgetTourRedirect, generalised over the product base
   so Operations + Advance don't each need a near-identical file.
   ============================================ */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

export function WorkspaceTourRedirect({ base }: { base: string }) {
  const router = useRouter();
  const { resumeTourId } = useArtistTourContext();

  useEffect(() => {
    if (!resumeTourId) return;
    router.replace(`${base}/${resumeTourId}`);
  }, [resumeTourId, base, router]);

  return null;
}
