/* ============================================
   LOWPASS — Operations · Payroll (Phase 1 §C placeholder)

   /operations/[tourId]/payroll — replaces /tours/[id]/payroll. Phase 4
   ports the existing surface onto the new shell.
   ============================================ */

import { ProductShell } from '@/components/shell-v2';
import { PhaseScaffoldPlaceholder } from '@/components/shell-v2/PhaseScaffoldPlaceholder';

export default async function OperationsTourPayrollPage({
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
        title="Operations · Payroll"
        phase="Phase 4"
        body={`Tour Payroll captures per-week / per-show pay for personnel assigned to this tour. Phase 4 ports it onto the new shell.`}
      />
    </ProductShell>
  );
}
