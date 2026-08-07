'use client';

/* ============================================================
   LOWPASS — <DaySheetActions> (D1-2)

   Client island for the Day surface header: a one-click "Day sheet PDF"
   download (Standard template, straight through POST
   /api/day/[routingId]/export/pdf — the settlement Export PDF pattern) plus
   the "Day sheet…" button that opens the <DaySheetComposer> modal for the
   audience templates. Kept out of the server DaySheet so the page stays a
   server component.
   ============================================================ */

import { useState } from 'react';
import { DaySheetComposer } from '@/components/day/DaySheetComposer';

export function DaySheetActions({ routingId }: { routingId: string }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function downloadPdf() {
    setDownloading(true);
    try {
      // Empty body → the route normalizes to the Standard day-sheet config.
      const res = await fetch(`/api/day/${routingId}/export/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        alert('Export failed');
        return;
      }
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/.exec(cd)?.[1] ?? 'Day Sheet.pdf';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = decodeURIComponent(name);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void downloadPdf()}
        disabled={downloading}
        data-testid="daysheet-download-direct"
        className="btn-transition rounded-md border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
        title="Download the Standard day sheet as a PDF"
      >
        {downloading ? 'Building…' : 'Day sheet PDF'}
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="daysheet-open-composer"
        className="btn-transition rounded-md border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
        title="Compose a Day Sheet PDF (Standard / Crew / Driver / Band / Compact)"
      >
        Day sheet…
      </button>
      {open ? <DaySheetComposer routingId={routingId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
