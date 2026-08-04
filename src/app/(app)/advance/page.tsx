/* ============================================
   LOWPASS — Advance · workspace-level router (S-3b)

   Advance is tour-scoped; /advance with no tour is a selection funnel:

   - context has a selected tour → WorkspaceTourRedirect hard-replaces
     to /advance/{tourId} (its layout resolves the active show)
   - no tour anywhere → "Select a tour to open Advance" prompt

   S-3b — chrome is <ShellV3Mount landing>: the workspace rail stays fully
   visible (the workspace tier carries real information now) and the top bar
   renders its tour chrome GREYED — disabled mode pill, live artist/tour picker
   — until a tour is picked. Adam's call, 2026-08-04.
   ============================================ */

import { ShellV3Mount } from '@/components/shell-v3/ShellV3Mount';
import { WorkspaceTourRedirect } from '@/components/shell-v2/WorkspaceTourRedirect';
import { SelectTourPrompt } from '@/components/shell-v2/SelectTourPrompt';

export default function AdvanceWorkspacePage() {
  return (
    <ShellV3Mount pathname="/advance" landing>
      <WorkspaceTourRedirect base="/advance" />
      <SelectTourPrompt product="Advance" />
    </ShellV3Mount>
  );
}
