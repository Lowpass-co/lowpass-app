/* ============================================
   LOWPASS — Operations · Day View (Phase 1 §C placeholder)

   /operations/[tourId]/day — replaces /tours/[id]/day. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourDayViewPage({
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
        title="Operations · Day View"
        phase="Phase 4"
        body={`The Day View surfaces the day-of-show schedule with arrivals, soundcheck, doors, set times, and load-out. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
