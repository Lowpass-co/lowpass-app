/* ============================================
   LOWPASS — Operations · Routing (Phase 1 §C placeholder)

   /operations/[tourId]/routing — replaces /tours/[id]/routing. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourRoutingPage({
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
        title="Operations · Routing"
        phase="Phase 4"
        body={`The Routing surface manages day-by-day tour dates, venues, and travel. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
