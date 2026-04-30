/* ============================================
   LOWPASS — Operations · Hire (Phase 1 §C placeholder)

   /operations/[tourId]/hire — replaces /tours/[id]/hire. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourHirePage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  return (
    <ProductShell
      active="operations"
      artistId={null}
      tourId={tourId}
      productName="Operations"
    >
      <PhaseScaffoldPlaceholder
        title="Operations · Hire"
        phase="Phase 4"
        body={`Hire tracks freelance / one-off engagements for this tour. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
