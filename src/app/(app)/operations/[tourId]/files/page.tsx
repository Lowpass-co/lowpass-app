/* ============================================
   LOWPASS — Operations · Files (Phase 1 §C placeholder)

   /operations/[tourId]/files — replaces /tours/[id]/files. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourFilesPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Files"
      phase="Phase 4"
      body={`Tour Files is the per-tour document store (riders, contracts, advance docs). Phase 4 ports it onto the new shell.`}
    />
  );
}
