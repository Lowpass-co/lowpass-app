'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

/**
 * When the user has a band selected in the app shell but lands on /rider-packs
 * without ?artist_id=, sync the URL so the list stays scoped to that act.
 * `?all=1` keeps the full workspace list (opt-in) without redirecting.
 */
export function RiderPacksUrlSync() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { selectedArtistId, hydrated } = useArtistTourContext();

  useEffect(() => {
    if (!hydrated) return;
    const showAll =
      searchParams.get('all') === '1' || searchParams.get('all') === 'true';
    if (showAll) return;
    const inUrl = searchParams.get('artist_id');
    if (selectedArtistId && !inUrl) {
      router.replace(
        `/rider-packs?artist_id=${encodeURIComponent(selectedArtistId)}`,
      );
    }
  }, [hydrated, selectedArtistId, searchParams, router]);

  return null;
}
