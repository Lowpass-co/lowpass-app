/* ============================================
   LOWPASS — Budget overview panels (Phase B budget redesign)

   Two-up panel block above the main budget surface:
     [ Macro Allocation Donut ] [ Burn Rate Chart                 ]

   Stacks vertically on viewports < 1024px. Reads ?phase= from the URL
   so the burn-rate active-phase highlight stays in sync with the
   TourPhaseContextStrip.
   ============================================ */

'use client';

import { useSearchParams } from 'next/navigation';
import { MacroAllocationDonut } from '@/components/budget/MacroAllocationDonut';
import {
  BurnRateChart,
  type BurnPhaseBoundary,
} from '@/components/budget/BurnRateChart';
import type {
  AllocationSegment,
  BurnBucket,
} from '@/server/budget/getBudgetPanelData';
import type { TourPhaseKey } from '@/server/budget/computeTourPhases';

const VALID_KEYS: ReadonlySet<TourPhaseKey> = new Set([
  'pre-prod',
  'rehearsals',
  'show-days',
  'wrap',
]);

export type BudgetOverviewPanelsProps = {
  allocation: AllocationSegment[];
  burn: BurnBucket[];
  phaseBoundaries: BurnPhaseBoundary[];
  currency: string;
};

export function BudgetOverviewPanels({
  allocation,
  burn,
  phaseBoundaries,
  currency,
}: BudgetOverviewPanelsProps) {
  const searchParams = useSearchParams();
  const raw = searchParams.get('phase');
  const activePhaseKey: TourPhaseKey | null =
    raw && VALID_KEYS.has(raw as TourPhaseKey) ? (raw as TourPhaseKey) : null;

  return (
    <div
      className="grid gap-4"
      style={{
        gridTemplateColumns: 'minmax(0, 1fr)',
      }}
    >
      <div
        className="lp-budget-overview-grid grid gap-4"
        style={{
          gridTemplateColumns: 'minmax(0, 1fr)',
        }}
      >
        {/* Wider viewports flip to 2-up via the inline media query in
            <style jsx> below. Tailwind's @container would be cleaner
            but the project doesn't use it elsewhere. */}
        <MacroAllocationDonut segments={allocation} currency={currency} />
        <BurnRateChart
          buckets={burn}
          phaseBoundaries={phaseBoundaries}
          activePhaseKey={activePhaseKey}
          currency={currency}
        />
        <style>{`
          @media (min-width: 1024px) {
            .lp-budget-overview-grid {
              grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
