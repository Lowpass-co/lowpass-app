'use client';

/* ============================================
   LOWPASS — <ExportDialog> (#8 Document Export, Budget slice)

   The small options dialog for the branded Budget PDF: the scope toggle
   (Projected / Actual / Both + Variance — default Both + Variance), then POST the
   export route and download the streamed PDF. Reused-shape for later surfaces;
   surfaces with no options skip straight to the POST.
   ============================================ */

import { useState } from 'react';
import { useToast } from '@/components/ui/Toast';

type Scope = 'projected' | 'actual' | 'both';

const SCOPES: ReadonlyArray<{ value: Scope; label: string; hint: string }> = [
  { value: 'both', label: 'Both + Variance', hint: 'Projected, actual & the delta' },
  { value: 'projected', label: 'Projected', hint: 'Forecast figures only' },
  { value: 'actual', label: 'Actual', hint: 'Settled figures only' },
];

export function ExportDialog({
  tourId,
  versionId,
  onClose,
}: {
  tourId: string;
  versionId: string | null;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const [scope, setScope] = useState<Scope>('both');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const qs = new URLSearchParams({ scope });
      if (versionId) qs.set('version', versionId);
      const res = await fetch(`/api/budget/${encodeURIComponent(tourId)}/export/pdf?${qs.toString()}`, { method: 'POST' });
      if (!res.ok) {
        showToast(res.status === 404 ? 'Tour not found' : 'Could not generate the PDF', 'error');
        setBusy(false);
        return;
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="(.+?)"/.exec(cd)?.[1] ?? 'Budget.pdf';
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      onClose();
    } catch {
      showToast('Could not generate the PDF', 'error');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as unknown as number,
        background: 'color-mix(in srgb, var(--lp-bg-deep) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--lp-space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420, width: '100%', background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)',
          padding: 'var(--lp-space-5)', boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 4 }}>Export branded PDF</h3>
        <p style={{ fontSize: 13, color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-4)' }}>
          A send-ready A4 document — P&amp;L summary + full line detail.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 'var(--lp-space-4)' }}>
          {SCOPES.map((s) => {
            const on = scope === s.value;
            return (
              <button
                key={s.value} type="button" onClick={() => setScope(s.value)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  textAlign: 'left', cursor: 'pointer', padding: '9px 12px',
                  borderRadius: 'var(--lp-radius-md)', fontSize: 13,
                  border: `1px solid ${on ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
                  background: on ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
                  color: 'var(--lp-text)', fontWeight: on ? 700 : 500,
                }}
              >
                <span>{s.label}</span>
                <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', fontWeight: 400 }}>{s.hint}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button" onClick={onClose} disabled={busy} className="btn-transition"
            style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={() => void run()} disabled={busy} className="btn-transition"
            style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 14px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: 'pointer' }}
          >
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
