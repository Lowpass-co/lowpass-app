'use client';

/* ============================================================
   LOWPASS — <AdvanceExportButton> (grade G1-A #6)

   The "Export advance" button, sitting beside Send Packet on the per-show
   Advance header. Matches the app's one-show / multi-show scope pattern: a small
   menu offering "This show" and "Whole tour", each opening the packet PDF.

   Uses the existing packet route:
     /api/advance-packets/[tourId]/[routingId]/pdf   → this show
     /api/advance-packets/[tourId]/all/pdf           → whole tour (the `all`
       sentinel maps to an empty routingId server-side → "All shows" manifest).

   NOTE: the full config-aware export shell (ExportTemplateEditor parity) for the
   advance PDF is the G2 design-gated item; this is the G1 unblock — make Export
   visible beside Send Packet with a working one-show/multi-show choice.
   ============================================================ */

import { useEffect, useRef, useState } from 'react';
import { Download, ChevronDown, FileText, Files } from 'lucide-react';

export function AdvanceExportButton({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exportUrl = (scope: 'show' | 'tour') =>
    `/api/advance-packets/${tourId}/${scope === 'tour' ? 'all' : routingId}/pdf`;

  const go = (scope: 'show' | 'tour') => {
    window.open(exportUrl(scope), '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-transition inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
        style={{
          borderColor: 'var(--lp-border-strong)',
          background: 'var(--lp-bg)',
          color: 'var(--lp-text)',
          fontSize: '13px',
          fontWeight: 500,
        }}
        title="Export this advance as a PDF"
      >
        <Download className="h-3.5 w-3.5" />
        Export advance
        <ChevronDown className="h-3.5 w-3.5" style={{ color: 'var(--lp-text-tertiary)' }} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-[60] mt-1.5 w-56 overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-panel)' }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => go('show')}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-lp-surface-hover"
            style={{ color: 'var(--lp-text)' }}
          >
            <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
            This show
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => go('tour')}
            className="flex w-full items-center gap-2.5 border-t px-3 py-2.5 text-left text-sm hover:bg-lp-surface-hover"
            style={{ color: 'var(--lp-text)', borderColor: 'var(--lp-border-subtle)' }}
          >
            <Files className="h-4 w-4 shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
            Whole tour
          </button>
        </div>
      ) : null}
    </div>
  );
}
