/* ============================================
   LOWPASS — Operations · workspace-level router (IA tour-flow fix §2)

   Operations is tour-scoped. Landing on /operations with no tour
   selected used to drop the user on a Phase-4 placeholder that went
   nowhere. Now it mirrors the Budget pattern:

   - context has a selected tour → WorkspaceTourRedirect hard-replaces
     to /operations/{tourId}
   - no tour anywhere → "Select a tour to open Operations" prompt with a
     link to the artist picker

   The cross-tour Operations dashboard (Phase 4) can mount on this route
   when built; until then this is a clean tour-selection funnel rather
   than a dead placeholder.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { WorkspaceTourRedirect } from '@/components/shell-v2/WorkspaceTourRedirect';
import { SelectTourPrompt } from '@/components/shell-v2/SelectTourPrompt';

export default function OperationsDashboardPage() {
  return (
    <ProductShell active="operations" artistId={null} productName="Operations">
      <WorkspaceTourRedirect base="/operations" />
      <SelectTourPrompt product="Operations" />
    </ProductShell>
  );
}
