/* ============================================
   LOWPASS — Operations · Channel List (Phase 1 §C placeholder)

   /operations/[tourId]/channel-list — replaces /tours/[id]/channel-list. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourChannelListPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Channel List"
      phase="Phase 4"
      body={`The Channel List spreadsheet captures front-of-house and monitor channel assignments. Phase 4 ports it onto the new shell.`}
    />
  );
}
