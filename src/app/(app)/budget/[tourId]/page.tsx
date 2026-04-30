/* ============================================
   LOWPASS — Budget · Tour landing (Phase 1 §C placeholder)

   /budget/[tourId] — replaces /tours/[id]/budget. Phase 3 ports
   the existing budget surface onto this URL.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function BudgetTourLandingPage({
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
        title="Budget · tour"
        phase="Phase 3"
        body="The Budget tour surface lists line items grouped by category, with proposed/actual costs, status, and per-line attachments. Phase 3 ports the existing /tours/[id]/budget content onto this URL."
      />
    </ProductShell>
  );
}
