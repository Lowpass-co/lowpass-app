'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/**
 * When budget page has no tour_id in URL but context has a selected tour,
 * redirect to /tours/{id}/budget so the user lands on the tour budget hub.
 */
export function BudgetTourRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedTourId } = useArtistTourContext();
  const tourIdFromUrl = searchParams.get('tour_id');

  useEffect(() => {
    if (tourIdFromUrl || !selectedTourId) return;
    router.replace(`/tours/${selectedTourId}/budget`);
  }, [tourIdFromUrl, selectedTourId, router]);

  return null;
}
