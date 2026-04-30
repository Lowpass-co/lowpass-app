/* ============================================
   LOWPASS — Advance · Per-show form (Phase 1 §C placeholder)

   /advance/[tourId]/[routingId] — replaces /tours/[id]/advance/[routingId].
   Phase 2 ports the existing per-show advance form onto this URL.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function AdvanceShowPage({
  params,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
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
        title="Advance · per-show form"
        phase="Phase 2"
        body="The per-show advance form is the day-of-show source of truth: contacts, venue spec, hospitality, schedule. Phase 2 ports the existing /tours/[id]/advance/[routingId] content onto this URL."
      />
    </ProductShell>
  );
}
