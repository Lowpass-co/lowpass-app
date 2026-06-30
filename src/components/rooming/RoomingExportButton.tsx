'use client';

/* ============================================
   LOWPASS — <RoomingExportButton> (#8 Document Export, Rooming slice)

   "Export…" — opens the <ExportTemplateEditor> (live preview + settings) for the
   branded rooming-list PDF. (The old direct one-shot download is retired in favour
   of the editor; rooming has no scope toggle but gets section/page/logo controls.)
   ============================================ */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ExportTemplateEditor } from '@/components/export/ExportTemplateEditor';

export function RoomingExportButton({ tourId }: { tourId: string }) {
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
        title="Export a branded rooming-list PDF"
      >
        <FileText className="h-4 w-4" aria-hidden />
        Export…
      </button>
      {open ? <ExportTemplateEditor surface="rooming" tourId={tourId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
