'use client';

import { useEffect, useState } from 'react';

/**
 * Returns true when the viewport is narrower than the Tailwind `md` breakpoint (768px).
 * SSR-safe: returns `false` during server render, updates after hydration.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  return isMobile;
}
