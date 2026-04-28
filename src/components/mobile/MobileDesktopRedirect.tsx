'use client';

import { useArtistTourContext } from '@/contexts/ArtistTourContext';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';

/** Redirects desktop viewports away from `/m/*` toward full desktop flows. */
export function MobileDesktopRedirect() {
  const pathname = usePathname();
  const router = useRouter();
  const { selectedTourId } = useArtistTourContext();
  const isMobile = useIsMobile();

  const mapped = useMemo(() => {
    if (isMobile) return null;
    const tid = selectedTourId;
    if (!tid) return null;
    if (pathname === '/m/today') return `/dashboard`;
    const showMatch = pathname.match(/^\/m\/show\/([^/]+)$/);
    if (showMatch) return `/tours/${tid}/advance/${showMatch[1]}`;
    const showFileMatch = pathname.match(/^\/m\/show\/([^/]+)\/file\/(.+)$/);
    if (showFileMatch) return `/tours/${tid}/files`;
    if (pathname === '/m/files') return `/tours/${tid}/files`;
    if (pathname === '/m/deal-memos' || pathname.startsWith('/m/deal-memo/')) return `/library/deal-memos`;
    if (pathname === '/m/receipt')
      return `/tours/${tid}?expenseFlow=1`;
    return null;
  }, [isMobile, pathname, selectedTourId]);

  useEffect(() => {
    if (!mapped) return;
    router.replace(mapped);
  }, [mapped, router]);

  return null;
}
