/* ============================================
   LOWPASS — Advance · workspace-level router (IA tour-flow fix §2)

   Advance is tour-scoped. /advance used to blind-redirect to /artists,
   losing the user's intent. Now it mirrors the Budget / Operations
   pattern:

   - context has a selected tour → WorkspaceTourRedirect hard-replaces
     to /advance/{tourId} (its layout resolves the active show)
   - no tour anywhere → "Select a tour to open Advance" prompt with a
     link to the artist picker

   Live per-show surface stays at /advance/[tourId]/[routingId].
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { WorkspaceTourRedirect } from '@/components/shell-v2/WorkspaceTourRedirect';
import { SelectTourPrompt } from '@/components/shell-v2/SelectTourPrompt';

export default function AdvanceWorkspacePage() {
  return (
    <ProductShell active="advance" artistId={null} productName="Advance">
      <WorkspaceTourRedirect base="/advance" />
      <SelectTourPrompt product="Advance" />
    </ProductShell>
  );
}
