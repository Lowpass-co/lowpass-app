/* ============================================
   LOWPASS — Enforce artist/tour scope in the URL

   When an artist is selected, tour routes and budget tour_id must
   belong to that artist’s tour list. When a tour is pinned, URLs
   are normalized to that tour id.
   ============================================ */

'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

const TOUR_PATH_RE = /^\/tours\/([0-9a-f-]{36})(\/.*)?$/i;

export function ArtistTourScopeGuard() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    selectedArtistId,
    selectedTourId,
    tours,
    isLoading,
    hydrated,
  } = useArtistTourContext();

  const searchKey = searchParams.toString();

  useEffect(() => {
    if (!hydrated || isLoading) return;

    const allowedTourIds = new Set(tours.map((t) => t.id));
    const tab = searchParams.get('tab') ?? 'summary';

    if (selectedTourId) {
      const m = pathname.match(TOUR_PATH_RE);
      if (m && m[1] !== selectedTourId) {
        const suffix = m[2] && m[2].length > 0 ? m[2] : '/overview';
        router.replace(`/tours/${selectedTourId}${suffix}`);
        return;
      }

      if (pathname.startsWith('/budget')) {
        const tid = searchParams.get('tour_id');
        if (!tid || tid !== selectedTourId) {
          router.replace(`/budget?tour_id=${selectedTourId}&tab=${tab}`);
        }
      }
      return;
    }

    if (!selectedArtistId) return;

    if (pathname.startsWith('/budget')) {
      const tid = searchParams.get('tour_id');
      if (tid && !allowedTourIds.has(tid)) {
        const next = new URLSearchParams(searchParams.toString());
        next.delete('tour_id');
        const q = next.toString();
        router.replace(q ? `/budget?${q}` : '/budget');
        return;
      }
    }

    const m = pathname.match(TOUR_PATH_RE);
    if (m) {
      const pathTourId = m[1];
      if (!allowedTourIds.has(pathTourId)) {
        router.replace('/tours');
      }
    }
  }, [
    hydrated,
    isLoading,
    selectedArtistId,
    selectedTourId,
    tours,
    pathname,
    router,
    searchParams,
    searchKey,
  ]);

  return null;
}
