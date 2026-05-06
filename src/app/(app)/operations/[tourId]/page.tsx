/* ============================================
   LOWPASS — Operations · Tour landing (Phase 1 §C placeholder)

   /operations/[tourId] — replaces /tours/[id] / /tours/[id]/summary.
   Phase 4 ports the canonical Operations landing here.

   Sprint 8.1 §2 — ProductShell + TourHeader chrome was hoisted
   to /operations/[tourId]/layout.tsx; this page now renders only
   the body content. Layout owns artist + tour + crewCount fetch
   and the switcher wrapper, which now persists across operations
   sub-routes and [tourId] changes.
   ============================================ */

import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourLandingPage() {
  return (
    <PhaseScaffoldPlaceholder
      title="Operations · tour overview"
      phase="Phase 4"
      body="The Operations tour-landing is the canonical entry for this tour: setup status, primary CTA, secondary cards, and the Tour Hub navigation. Phase 4 ports the existing /tours/[id]/summary content here."
    />
  );
}
