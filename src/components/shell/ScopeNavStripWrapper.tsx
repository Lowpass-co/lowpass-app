'use client';

/* ============================================
   LOWPASS — <ScopeNavStripWrapper> (Sprint 10 §1.4)

   Tiny client wrapper for <ScopeNavStrip>. Derives the scope
   from usePathname() so the (app)/layout.tsx server component
   doesn't need pathname access. Pure pass-through to the strip
   component itself.
   ============================================ */

import { usePathname } from 'next/navigation';
import { useMemo } from 'react';
import { ScopeNavStrip } from '@/components/shell/ScopeNavStrip';
import { deriveScope } from '@/lib/shell/scope';

interface ScopeNavStripWrapperProps {
  isSiteAdmin: boolean;
}

export function ScopeNavStripWrapper({ isSiteAdmin }: ScopeNavStripWrapperProps) {
  const pathname = usePathname();
  const scope = useMemo(() => deriveScope(pathname), [pathname]);
  return <ScopeNavStrip scope={scope} isSiteAdmin={isSiteAdmin} />;
}
