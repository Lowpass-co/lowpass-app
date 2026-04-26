'use client';

import { useCallback } from 'react';
import { LeftRail, type LeftRailVariant } from '@/components/shell/LeftRail';

type DocBase = Extract<LeftRailVariant, { kind: 'docDays' }>;

/** Adds day navigation: scrolls to a row when present (e.g. `data-routing-date` on routing grid). */
export function DocDaysLeftRailClient({ base }: { base: DocBase }) {
  const onDayClick = useCallback((date: string) => {
    const fromRouting = document.querySelector(`[data-routing-date="${date}"]`);
    if (fromRouting) {
      fromRouting.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const fromAdvance = document.querySelector(`[data-advance-day="${date}"]`);
    fromAdvance?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, []);

  return <LeftRail variant={{ ...base, onDayClick }} />;
}
