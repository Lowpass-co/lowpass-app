/* ============================================
   LOWPASS — Operations · Hire (Phase 4 unblock)

   /operations/[tourId]/hire — live tour gear/hire library. Ports
   /tours/[id]/hire, inner content only (ProductShell + TourHeader come
   from /operations/[tourId]/layout.tsx).
   ============================================ */

import { GearLibraryClient } from '@/components/gear/GearLibraryClient';
import { PageHeader } from '@/components/ui/PageHeader';

export const dynamic = 'force-dynamic';

export default async function OperationsTourHirePage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6">
      <PageHeader
        title="Gear"
        subtitle="Gear and hire for this tour. Hire costs go into the budget automatically."
      />
      <GearLibraryClient tourId={tourId} />
    </div>
  );
}
