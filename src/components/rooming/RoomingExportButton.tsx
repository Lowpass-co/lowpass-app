'use client';

/* ============================================
   LOWPASS — <RoomingExportButton> (#8 Document Export, Rooming slice)

   Thin wrapper over the shared <ExportButton> (surface="rooming").
   ============================================ */

import { ExportButton } from '@/components/export/ExportButton';

export function RoomingExportButton({ tourId }: { tourId: string }) {
  return <ExportButton surface="rooming" tourId={tourId} title="Export a branded rooming-list PDF" />;
}
