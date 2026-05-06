/* ============================================
   LOWPASS — Operations · Personnel (Phase 1 §C placeholder)

   /operations/[tourId]/personnel — replaces /tours/[id]/personnel. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourPersonnelPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Personnel"
      phase="Phase 4"
      body={`Tour-scoped Personnel manages crew assignments to this specific tour. Phase 4 ports it onto the new shell.`}
    />
  );
}
