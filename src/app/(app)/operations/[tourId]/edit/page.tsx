/* ============================================
   LOWPASS — Operations · Edit Tour (Phase 1 §C placeholder)

   /operations/[tourId]/edit — replaces /tours/[id]/edit. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourEditTourPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Edit Tour"
      phase="Phase 4"
      body={`Tour metadata edit (name, dates, currency, status). Phase 4 ports it onto the new shell.`}
    />
  );
}
