/* ============================================
   LOWPASS — Operations · Rooming (Phase 1 §C placeholder)

   /operations/[tourId]/rooming — replaces /tours/[id]/rooming. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourRoomingPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Rooming"
      phase="Phase 4"
      body={`Rooming assigns hotel rooms per show date and per tour personnel. Phase 4 ports it onto the new shell.`}
    />
  );
}
