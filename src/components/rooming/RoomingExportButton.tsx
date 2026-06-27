'use client';

/* ============================================
   LOWPASS — <RoomingExportButton> (#8 Document Export, Rooming slice)

   A single "Branded PDF" download on the Rooming surface — no scope toggle
   (rooming has no projected/actual). POSTs the export route + downloads the
   streamed PDF. Same download pattern as the Budget ExportDialog.
   ============================================ */

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

export function RoomingExportButton({ tourId }: { tourId: string }) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/rooming/${encodeURIComponent(tourId)}/export/pdf`, { method: 'POST' });
      if (!res.ok) {
        showToast(res.status === 404 ? 'Tour not found' : 'Could not generate the PDF', 'error');
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="(.+?)"/.exec(cd)?.[1] ?? 'Rooming.pdf';
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
    } catch {
      showToast('Could not generate the PDF', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void run()}
      disabled={busy}
      className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
      style={{
        borderColor: 'var(--color-lp-orange)',
        color: 'var(--color-lp-orange)',
        background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
        fontWeight: 'var(--lp-weight-medium)',
        cursor: busy ? 'default' : 'pointer',
      }}
      title="Download a branded rooming-list PDF"
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Download className="h-4 w-4" aria-hidden />}
      {busy ? 'Generating…' : 'Branded PDF'}
    </button>
  );
}
