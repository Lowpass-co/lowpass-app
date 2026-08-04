/* ============================================
   LOWPASS — Operations · workspace-level router (S-3b)

   Operations is tour-scoped; /operations with no tour is a selection funnel:

   - context has a selected tour → WorkspaceTourRedirect hard-replaces
     to /operations/{tourId}
   - no tour anywhere → "Select a tour to open Operations" prompt

   S-3b — chrome is <ShellV3Mount landing>: the workspace rail stays fully
   visible (the workspace tier carries real information now) and the top bar
   renders its tour chrome GREYED — disabled mode pill, live artist/tour picker
   — until a tour is picked. Adam's call, 2026-08-04.
   ============================================ */

import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { WorkspaceTourRedirect } from '@/components/shell-v2/WorkspaceTourRedirect';
import { SelectTourPrompt } from '@/components/shell-v2/SelectTourPrompt';

export default function OperationsDashboardPage() {
  return (
    <ShellV3Mount pathname="/operations" landing>
      <WorkspaceTourRedirect base="/operations" />
      <SelectTourPrompt product="Operations" />
    </ShellV3Mount>
  );
}
