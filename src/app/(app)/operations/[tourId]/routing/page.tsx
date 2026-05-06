/* ============================================
   LOWPASS — Operations · Routing (Phase 1 §C placeholder)

   /operations/[tourId]/routing — replaces /tours/[id]/routing. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourRoutingPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Routing"
      phase="Phase 4"
      body={`The Routing surface manages day-by-day tour dates, venues, and travel. Phase 4 ports it onto the new shell.`}
    />
  );
}
