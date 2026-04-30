/* ============================================
   LOWPASS — Operations · Files (Phase 1 §C placeholder)

   /operations/[tourId]/files — replaces /tours/[id]/files. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourFilesPage({
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
        title="Operations · Files"
        phase="Phase 4"
        body={`Tour Files is the per-tour document store (riders, contracts, advance docs). Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
