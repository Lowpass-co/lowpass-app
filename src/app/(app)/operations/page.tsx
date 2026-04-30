/* ============================================
   LOWPASS — Operations cross-tour dashboard (Phase 1 §C placeholder)

   Top-level Operations landing — not tour-scoped. Lists all tours
   with operations-relevant signals (upcoming shows, missing assets,
   personnel gaps). Phase 4 ports the real dashboard.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default function OperationsDashboardPage() {
  return (
    <ProductShell active="operations" artistId={null} productName="Operations">
      <PhaseScaffoldPlaceholder
        title="Operations dashboard (cross-tour)"
        phase="Phase 4"
        body="The cross-tour Operations overview lists every active tour with status, upcoming shows, missing personnel assignments, and rooming/routing flags — at a glance. Phase 4 ports the real dashboard onto this route."
      />
    </ProductShell>
  );
}
