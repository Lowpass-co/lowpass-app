/* ============================================
   LOWPASS — Operations · Hire (Phase 4 unblock)

   /operations/[tourId]/hire — live tour gear/hire library. Ports
   /tours/[id]/hire, inner content only (ProductShell + TourHeader come
   from /operations/[tourId]/layout.tsx).
   ============================================ */

import { GearLibraryClient } from '@/components/gear/GearLibraryClient';

export const dynamic = 'force-dynamic';

export default async function OperationsTourHirePage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6">
      <h1 className="text-2xl font-bold text-lp-text">Tour Hire</h1>
      <GearLibraryClient tourId={tourId} />
    </div>
  );
}
