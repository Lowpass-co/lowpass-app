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

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ExportButton } from '@/components/export/ExportButton';
import { WorkbookImportModal } from '@/components/budget/WorkbookImportModal';

/** X1-A — the six-sheet Tour Accounting Workbook (.xlsx an accountant can edit). */
function WorkbookButton({ tourId, versionId }: { tourId: string; versionId: string | null }) {
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
  return (
    <button
      type="button"
      data-testid="budget-export-workbook"
      onClick={() => void download()}
      disabled={busy}
      className="btn-transition rounded-md border px-3 py-1.5 text-sm"
      style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
      title="Export the whole tour as a six-sheet accounting workbook (.xlsx)"
    >
      {busy ? 'Building…' : 'Export workbook…'}
    </button>
  );
}

const DISPLAY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'GBP', label: '£ GBP' },
  { code: 'USD', label: '$ USD' },
  { code: 'EUR', label: '€ EUR' },
  { code: 'CAD', label: 'C$ CAD' },
  { code: 'AUD', label: 'A$ AUD' },
];

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
      <span
        className="text-xs"
        style={{
          color: 'var(--lp-text-tertiary)',
          fontWeight: 'var(--lp-weight-semibold)',
          letterSpacing: 'var(--lp-tracking-caps)',
          textTransform: 'uppercase',
        }}
      >
        Display
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
        <button
          type="button"
          data-testid="budget-import-workbook"
          onClick={() => setImportOpen(true)}
          className="btn-transition rounded-md border px-3 py-1.5 text-sm"
          style={{ borderColor: 'var(--lp-border-strong)', color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          title="Import an edited workbook (review-queued — nothing writes until you accept)"
        >
          Import workbook…
        </button>
        <WorkbookButton tourId={tourId} versionId={viewedVersionId} />
        <ExportButton surface="budget" tourId={tourId} versionId={viewedVersionId} title="Export the budget (PDF or Excel)" />
      </div>
      {importOpen ? <WorkbookImportModal tourId={tourId} onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}
