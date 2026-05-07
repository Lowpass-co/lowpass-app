/* ============================================
   LOWPASS — Operations · Riders (Phase 1 §C placeholder)

   /operations/[tourId]/riders — replaces /tours/[id]/riders. Phase 4
   ports the existing surface onto the new shell.

   Sprint 8.1 §2 — ProductShell hoisted to /operations/[tourId]/layout.tsx.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsTourRidersPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · Riders"
      phase="Phase 4"
      body={`Riders are the technical and hospitality requirements per show. Phase 4 ports the existing Rider Packs feature onto this URL.`}
    />
  );
}
