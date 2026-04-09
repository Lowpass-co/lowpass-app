/* ============================================
   LOWPASS — Keep ?artist_id= in sync with header scope

   On Dashboard, Tours, Advances, Performance, mirror selectedArtistId
   into the URL so server components can filter.
   ============================================ */

'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useArtistTourContext } from '@/contexts/ArtistTourContext';

const SCOPED_PATHS = new Set(['/dashboard', '/tours', '/advance', '/performance']);

export function OverviewArtistQuerySync() {
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedArtistId, hydrated } = useArtistTourContext();

  const base = pathname.split('?')[0];
  const searchKey = searchParams.toString();

  useEffect(() => {
    if (!hydrated || !SCOPED_PATHS.has(base)) return;

    const next = new URLSearchParams(searchParams.toString());
    const current = next.get('artist_id');

    if (selectedArtistId) {
      if (current === selectedArtistId) return;
      next.set('artist_id', selectedArtistId);
      router.replace(`${base}?${next.toString()}`);
      return;
    }

    if (current) {
      next.delete('artist_id');
      const q = next.toString();
      router.replace(q ? `${base}?${q}` : base);
    }
  }, [hydrated, selectedArtistId, base, router, searchParams, searchKey]);

  return null;
}
