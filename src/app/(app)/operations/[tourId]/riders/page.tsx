/* ============================================
   LOWPASS — Operations · Riders (Phase 1 §C placeholder)

   /operations/[tourId]/riders — replaces /tours/[id]/riders. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourRidersPage({
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
        title="Operations · Riders"
        phase="Phase 4"
        body={`Riders are the technical and hospitality requirements per show. Phase 4 ports the existing Rider Packs feature onto this URL.`}
      />
    </ProductShell>
  );
}
