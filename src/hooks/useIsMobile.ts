/* ============================================

   LOWPASS — useIsMobile

   Canonical responsive breakpoint hook.

   Returns true when viewport is narrower than Tailwind's `md` breakpoint

   (768px). SSR-safe: returns false on server, then syncs on mount.

   ============================================ */

'use client';

import { useEffect, useState } from 'react';

const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {

  const [isMobile, setIsMobile] = useState<boolean>(false);

  useEffect(() => {

    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);

    const update = () => setIsMobile(mq.matches);

    update();

    mq.addEventListener('change', update);

    return () => mq.removeEventListener('change', update);

  }, []);

  return isMobile;

}
