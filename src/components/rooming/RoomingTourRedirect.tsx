'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/**
 * When rooming page has no tour_id in URL but context has a selected tour,
 * redirect to /rooming?tour_id={id} so the user lands on the tour rooming.
 */
export function RoomingTourRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resumeTourId } = useArtistTourContext();
  const tourIdFromUrl = searchParams.get('tour_id');

  useEffect(() => {
    if (tourIdFromUrl || !resumeTourId) return;
    router.replace(`/rooming?tour_id=${resumeTourId}`);
  }, [tourIdFromUrl, resumeTourId, router]);

  return null;
}
