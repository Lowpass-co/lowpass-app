/* ============================================
   LOWPASS — Advance · Tour landing (Phase 1 §C placeholder)

   /advance/[tourId] — replaces /tours/[id]/advance. Phase 2 ports
   the existing advance surface onto this URL.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function AdvanceTourLandingPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  return (
    <ProductShell
      active="advance"
      artistId={null}
      tourId={tourId}
      productName="Advance"
    >
      <PhaseScaffoldPlaceholder
        title="Advance · tour"
        phase="Phase 2"
        body="The Advance tour surface lists every show on this tour with advance-form completion status and per-show drilldown. Phase 2 ports the existing /tours/[id]/advance content onto this URL."
      />
    </ProductShell>
  );
}
