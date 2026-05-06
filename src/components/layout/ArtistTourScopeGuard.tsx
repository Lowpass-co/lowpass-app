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
/** Sprint 6.1 §1 — the new product-prefixed routes
 *  (/budget/[uuid], /advance/[uuid], /operations/[uuid]) encode
 *  the tour id in the path segment. The legacy normalization
 *  logic below was written before these routes existed and
 *  assumes the canonical Budget URL is /budget?tour_id=. When
 *  the user lands on /budget/[uuid], the guard tries to bounce
 *  them to /budget?tour_id=[uuid], which the server immediately
 *  redirects back to /budget/[uuid] → infinite navigation loop
 *  (Chrome throttle warning, Safari white-screen client
 *  exception). Skip the guard entirely on these paths. */
const PRODUCT_PREFIXED_RE = /^\/(budget|advance|operations)\/[0-9a-f-]{36}/i;

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
    // Sprint 6.1 §1 — bail out for /budget/[uuid] etc. See the
    // PRODUCT_PREFIXED_RE comment for the loop these routes cause.
    if (PRODUCT_PREFIXED_RE.test(pathname)) return;

    const allowedTourIds = new Set(tours.map((t) => t.id));
    const tab = searchParams.get('tab') ?? 'summary';

    if (selectedTourId) {
      const m = pathname.match(TOUR_PATH_RE);
      if (m && m[1] !== selectedTourId) {
        const suffix = m[2] && m[2].length > 0 ? m[2] : '';
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
  }, [hydrated, isLoading, selectedArtistId, selectedTourId, tours, pathname, router, searchKey]);

  return null;
}
