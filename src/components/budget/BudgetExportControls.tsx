/* ============================================
   LOWPASS — Budget export controls (Phase F budget redesign)

   Page-header strip with:
     - display-currency switcher (?display=USD|GBP|EUR — converts the
       UI numbers via lib/budget/fx; underlying data unchanged)
     - the shared "Export…" button (#8 v2 — opens <ExportTemplateEditor>).

   The old client-side XLSX dump is RETIRED (#8 v2 Part C) — Excel is now a
   format toggle INSIDE the editor (a server-built flat sheet from the same
   loaders), so the entry point is one orange button identical to the other
   surfaces.
   ============================================ */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExportButton } from '@/components/export/ExportButton';
import { WorkbookImportModal } from '@/components/budget/WorkbookImportModal';
import { DISPLAY_CURRENCIES } from '@/lib/budget/displayCurrencies';

/** X1-A — the six-sheet Tour Accounting Workbook (.xlsx an accountant can edit).
 *  Oct 2026 — export + import now share ONE "Workbook" menu (was two buttons
 *  beside Export…, three look-alike buttons in a row). */
function WorkbookMenu({ tourId, versionId, onImport }: { tourId: string; versionId: string | null; onImport: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const res = await fetch('/api/export/workbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tourId, versionId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(typeof j.error === 'string' ? j.error : 'Workbook export failed');
        return;
      }
      const cd = res.headers.get('Content-Disposition') ?? '';
      const name = /filename="?([^"]+)"?/.exec(cd)?.[1] ?? 'Tour Accounting Workbook.xlsx';
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setBusy(false);
    }
  }
  const item: React.CSSProperties = {
    display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 'var(--lp-text-sm)',
    color: 'var(--lp-text)', background: 'transparent', border: 0, cursor: 'pointer', whiteSpace: 'nowrap',
  };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="btn-transition inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm"
        style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
        title="The accounting workbook (.xlsx) — export it, or import an edited copy"
      >
        {busy ? 'Building…' : 'Workbook'} <ChevronDown size={14} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 'var(--lp-z-dropdown)', minWidth: 260,
            background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)',
            boxShadow: 'var(--lp-shadow-md)', padding: '4px 0',
          }}
        >
          <button type="button" role="menuitem" data-testid="budget-export-workbook" disabled={busy} style={item} onClick={() => { setOpen(false); void download(); }}>
            Export accounting workbook (.xlsx)
          </button>
          <button type="button" role="menuitem" data-testid="budget-import-workbook" style={item} onClick={() => { setOpen(false); onImport(); }}>
            Import an edited workbook…
            <span style={{ display: 'block', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>Nothing changes until you review and accept</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

const DISPLAY_OPTIONS = DISPLAY_CURRENCIES;

export type BudgetExportControlsProps = {
  tourCurrency: string;
  /** #8 — for the branded server export route. */
  tourId: string;
};

export function BudgetExportControls({ tourCurrency, tourId }: BudgetExportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);

  const display = (searchParams.get('display') ?? tourCurrency).toUpperCase();
  // The viewed version (if the user is on a historical `?version=` view) — the
  // export's projected baseline matches what's on screen (#8 D1).
  const viewedVersionId = searchParams.get('version');

  const setDisplay = useCallback(
    (code: string) => {
      const next = new URLSearchParams(searchParams);
      if (code === tourCurrency) next.delete('display');
      else next.set('display', code);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams, tourCurrency],
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm" style={{ color: 'var(--lp-text-tertiary)' }}>
        Show in
      </span>
      <select
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        className="rounded-md border bg-transparent px-2 py-1 text-sm"
        style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text)' }}
        aria-label="Display currency"
      >
        {DISPLAY_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="ml-auto flex items-center gap-2">
        <WorkbookMenu tourId={tourId} versionId={viewedVersionId} onImport={() => setImportOpen(true)} />
        <ExportButton surface="budget" tourId={tourId} versionId={viewedVersionId} title="Export the budget (PDF or Excel)" />
      </div>
      {importOpen ? <WorkbookImportModal tourId={tourId} onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
