'use client';

/* ============================================
   LOWPASS — <RoutingExportButton> (#8 Document Export, Routing slice)

   Thin wrapper over the shared <ExportButton> (surface="routing") so the entry
   point is identical (orange) to budget / rooming / payroll.
   ============================================ */

import { ExportButton } from '@/components/export/ExportButton';

export function RoutingExportButton({ tourId }: { tourId: string }) {
  return <ExportButton surface="routing" tourId={tourId} title="Export a branded routing PDF" />;
}
