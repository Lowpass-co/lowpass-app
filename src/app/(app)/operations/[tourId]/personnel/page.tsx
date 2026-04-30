/* ============================================
   LOWPASS — Operations · Personnel (Phase 1 §C placeholder)

   /operations/[tourId]/personnel — replaces /tours/[id]/personnel. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourPersonnelPage({
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
        title="Operations · Personnel"
        phase="Phase 4"
        body={`Tour-scoped Personnel manages crew assignments to this specific tour. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
