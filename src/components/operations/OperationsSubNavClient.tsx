'use client';

/* ============================================
   LOWPASS — <OperationsSubNavClient> (Sprint 9 §14.11)

   Client wrapper around <OperationsSubNav> that derives the
   active slug from `usePathname()`. Used by the operations
   tour layout to mount the sub-nav once for ALL operations
   sub-pages (including placeholder pages that previously
   skipped mounting their own SubNav and lost the row entirely
   per smoke 13C2b).

   Active-slug derivation matches the constructed link href:
   "/operations/[tourId]" → activeSlug=''
   "/operations/[tourId]/<slug>" → activeSlug=<slug> (first
       path segment after the tour id)
   ============================================ */

import { usePathname } from 'next/navigation';
import {
  OperationsSubNav,
  type OperationsSubNavLink,
} from '@/components/operations/OperationsSubNav';

interface OperationsSubNavClientProps {
  tourId: string;
  links: OperationsSubNavLink[];
  leftSlot?: React.ReactNode;
}

export function OperationsSubNavClient({
  tourId,
  links,
  leftSlot,
}: OperationsSubNavClientProps) {
  const pathname = usePathname() ?? '';
  // Strip the /operations/[tourId] prefix; whatever remains is
  // either '' (summary) or '/<slug>(/...)?'. We only care about
  // the first segment.
  const prefix = `/operations/${tourId}`;
  let activeSlug = '';
  if (pathname.startsWith(prefix)) {
    const rest = pathname.slice(prefix.length);
    if (rest.startsWith('/')) {
      const seg = rest.slice(1).split('/')[0] ?? '';
      activeSlug = seg;
    }
  }
  return (
    <OperationsSubNav
      tourId={tourId}
      activeSlug={activeSlug}
      links={links}
      leftSlot={leftSlot}
    />
  );
}
