/* ============================================
   LOWPASS — Budget phase-strip reveal (Fix-pack B Task 6 / #18)

   Keeps the phase strip mounted and animates its height + opacity when
   the per-tour phase toggle flips, instead of flashing in/out. Uses the
   grid-template-rows 0fr↔1fr trick so height animates smoothly without
   measuring. Token-clean.
   ============================================ */

'use client';

import type { ReactNode } from 'react';

import { useTrackPhases } from './BudgetTrackPhasesContext';

/** Context-driven gate (Phase 4.2). Reads the shared track-phases state
 *  so flipping the Settings toggle animates the strip without a reload.
 *  Seeded once from the server value via the provider. */
export function BudgetPhaseStripGate({ children }: { children: ReactNode }) {
  const { trackPhases } = useTrackPhases();
  return <BudgetPhaseStripReveal visible={trackPhases}>{children}</BudgetPhaseStripReveal>;
}

export function BudgetPhaseStripReveal({
  visible,
  children,
}: {
  visible: boolean;
  children: ReactNode;
}) {
  return (
    <div
      aria-hidden={!visible}
      style={{
        display: 'grid',
        gridTemplateRows: visible ? '1fr' : '0fr',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition:
          'grid-template-rows var(--lp-duration-slow) var(--lp-ease-standard), opacity var(--lp-duration-slow) var(--lp-ease-standard)',
      }}
    >
      <div style={{ overflow: 'hidden', minHeight: 0 }}>{children}</div>
    </div>
  );
}
