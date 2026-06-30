'use client';

/* ============================================
   LOWPASS — <PayrollExportButton> (#8 Document Export, Payroll slice)

   "Export…" — opens the shared <ExportTemplateEditor> (live preview + settings) for
   the branded Payroll PDF (run sheet + per-person statements). Same editor as Budget
   / Rooming, surface="payroll" (sections: run sheet / statements + the styling panel).
   ============================================ */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ExportTemplateEditor } from '@/components/export/ExportTemplateEditor';

export function PayrollExportButton({ tourId }: { tourId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
        style={{
          borderColor: 'var(--color-lp-orange)',
          color: 'var(--color-lp-orange)',
          background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
          fontWeight: 'var(--lp-weight-medium)',
          cursor: 'pointer',
        }}
        title="Export a branded payroll PDF (run sheet + statements)"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Export…
      </button>
      {open ? <ExportTemplateEditor surface="payroll" tourId={tourId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
