'use client';

/* ============================================
   LOWPASS — <RoutingExportButton> (#8 Document Export, Routing slice)

   "Export…" — opens the shared <ExportTemplateEditor> for the branded Routing PDF
   (all days + an optional per-day advance summary). surface="routing".
   ============================================ */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ExportTemplateEditor } from '@/components/export/ExportTemplateEditor';

export function RoutingExportButton({ tourId }: { tourId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
        title="Export a branded routing PDF"
      >
        <FileText size={16} />
        Export…
      </button>
      {open ? <ExportTemplateEditor surface="routing" tourId={tourId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
