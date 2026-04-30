/* ============================================
   LOWPASS — Operations · Tour landing (Phase 1 §C placeholder)

   /operations/[tourId] — replaces /tours/[id] / /tours/[id]/summary.
   Phase 4 ports the canonical Operations landing here.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourLandingPage({
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
        title="Operations · tour overview"
        phase="Phase 4"
        body="The Operations tour-landing is the canonical entry for this tour: setup status, primary CTA, secondary cards, and the Tour Hub navigation. Phase 4 ports the existing /tours/[id]/summary content here."
      />
    </ProductShell>
  );
}
