'use client';

/* ============================================
   LOWPASS — <PayrollExportButton> (#8 Document Export, Payroll slice)

   Thin wrapper over the shared <ExportButton> (surface="payroll").
   ============================================ */

import { ExportButton } from '@/components/export/ExportButton';

export function PayrollExportButton({ tourId }: { tourId: string }) {
  return <ExportButton surface="payroll" tourId={tourId} title="Export a branded payroll PDF (run sheet + statements)" />;
}
