/* ============================================
   LOWPASS — Operations · Edit Tour (Phase 1 §C placeholder)

   /operations/[tourId]/edit — replaces /tours/[id]/edit. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourEditTourPage({
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
        title="Operations · Edit Tour"
        phase="Phase 4"
        body={`Tour metadata edit (name, dates, currency, status). Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
