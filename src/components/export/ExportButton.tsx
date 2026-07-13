'use client';

/* ============================================
   LOWPASS — <ExportButton> (#8 Document Export)

   The ONE export entry point for every surface — an identical orange "Export…"
   button that opens the shared <ExportTemplateEditor>. Used by payroll / rooming /
   routing (and budget once its XLSX menu is retired). Keeping it in one place means
   the four surfaces can never drift in styling again.
   ============================================ */

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { ExportTemplateEditor } from '@/components/export/ExportTemplateEditor';
import type { BudgetScope, ExportSurface } from '@/lib/export/template-config';

export function ExportButton({
  surface,
  tourId,
  versionId = null,
  initialScope,
  label = 'Export…',
  title,
}: {
  surface: ExportSurface;
  tourId: string;
  versionId?: string | null;
  initialScope?: BudgetScope;
  label?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
        /* §D hue-budget — Export is a SECONDARY action (neutral), not the page's
           single primary. One primary per page; export never competes for it. */
        style={{
          borderColor: 'var(--lp-border-strong)',
          color: 'var(--lp-text-secondary)',
          background: 'var(--lp-panel)',
          fontWeight: 'var(--lp-weight-medium)',
          cursor: 'pointer',
        }}
        title={title ?? 'Export a branded PDF'}
      >
        <FileText className="h-4 w-4" aria-hidden />
        {label}
      </button>
      {open ? (
        <ExportTemplateEditor surface={surface} tourId={tourId} versionId={versionId} initialScope={initialScope} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
