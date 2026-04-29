/* ============================================
   LOWPASS — Budget Phase strip client wrapper

   Owns the active-phase selection state for the budget page. Wraps
   <TourPhaseContextStrip>; the rest of the budget hub reads
   `activePhaseKey` from URL state (`?phase=show-days`) so deep
   links survive a refresh and browser back/forward works.

   Filter wiring lives in the consumer pages — this component just
   syncs URL ↔ selection. Phase C / E components (table, charts,
   etc.) will read the same query param.
   ============================================ */

'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  TourPhaseContextStrip,
  type TourPhaseContextStripProps,
} from '@/components/tours/TourPhaseContextStrip';
import type { TourPhaseKey } from '@/server/budget/computeTourPhases';

const VALID_KEYS: ReadonlySet<TourPhaseKey> = new Set([
  'pre-prod',
  'rehearsals',
  'show-days',
  'wrap',
]);

export function BudgetPhaseStripClient({
  phases,
}: Pick<TourPhaseContextStripProps, 'phases'>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get('phase');
  const activePhaseKey: TourPhaseKey | null =
    raw && VALID_KEYS.has(raw as TourPhaseKey) ? (raw as TourPhaseKey) : null;

  const onPhaseChange = useCallback(
    (key: TourPhaseKey | null) => {
      const next = new URLSearchParams(searchParams);
      if (key) next.set('phase', key);
      else next.delete('phase');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <TourPhaseContextStrip
      phases={phases}
      activePhaseKey={activePhaseKey}
      onPhaseChange={onPhaseChange}
    />
  );
}
