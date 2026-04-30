/* ============================================
   LOWPASS — Operations · Channel List (Phase 1 §C placeholder)

   /operations/[tourId]/channel-list — replaces /tours/[id]/channel-list. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourChannelListPage({
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
        title="Operations · Channel List"
        phase="Phase 4"
        body={`The Channel List spreadsheet captures front-of-house and monitor channel assignments. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
