/* ============================================
   LOWPASS — Budget · Settlement (Phase 1 §C placeholder)

   /budget/[tourId]/settlement — replaces /tours/[id]/budget/settlement.
   Phase 3 ports the settlement workspace.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function BudgetSettlementPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  return (
    <ProductShell
      active="budget"
      artistId={null}
      tourId={tourId}
      productName="Budget"
    >
      <PhaseScaffoldPlaceholder
        title="Budget · Settlement"
        phase="Phase 3"
        body="The Settlement workspace reconciles per-show financials against the tour budget. Phase 3 ports it onto the new shell."
      />
    </ProductShell>
  );
}
