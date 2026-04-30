/* ============================================
   LOWPASS — Operations · Rooming (Phase 1 §C placeholder)

   /operations/[tourId]/rooming — replaces /tours/[id]/rooming. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourRoomingPage({
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
        title="Operations · Rooming"
        phase="Phase 4"
        body={`Rooming assigns hotel rooms per show date and per tour personnel. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
