'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/**
 * When the legacy /budget page has no tour_id in URL but context has a
 * selected tour, hard-redirect to /budget/{tourId} (Phase 3 surface) so
 * the user lands on the dynamic-route page instead of the workspace-level
 * fall-through.
 *
 * Post-merge fix-up: target was /tours/{id}/budget pre-Phase-3 but that
 * URL no longer renders content — it 301s back to /budget/{id} via
 * next.config redirects. Going there directly skips a needless hop.
 */
export function BudgetTourRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedTourId } = useArtistTourContext();
  const tourIdFromUrl = searchParams.get('tour_id');

  useEffect(() => {
    if (tourIdFromUrl || !selectedTourId) return;
    router.replace(`/budget/${selectedTourId}`);
  }, [tourIdFromUrl, selectedTourId, router]);

  return null;
}
