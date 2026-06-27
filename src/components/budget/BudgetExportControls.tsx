/* ============================================
   LOWPASS — Budget export controls (Phase F budget redesign)

   Page-header strip with:
     - display-currency switcher (?display=USD|GBP|EUR — converts the
       UI numbers via lib/budget/fx; underlying data unchanged)
     - "Export…" menu: XLSX flat dump (client-side) + a branded PDF
       (#8 — server-rendered, opens <ExportDialog>).

   The XLSX dump stays client-side (xlsx). The old client-side jspdf
   "PDF summary" is RETIRED (#8 D6) — the branded server PDF replaces
   it as the single export path.
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { convertToCurrency } from '@/lib/budget/fx';
import { ExportDialog } from '@/components/budget/ExportDialog';
import type { BudgetLineItem } from '@/types';

const DISPLAY_OPTIONS: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'GBP', label: '£ GBP' },
  { code: 'USD', label: '$ USD' },
  { code: 'EUR', label: '€ EUR' },
  { code: 'CAD', label: 'C$ CAD' },
  { code: 'AUD', label: 'A$ AUD' },
];

export type BudgetExportControlsProps = {
  lines: BudgetLineItem[];
  tourCurrency: string;
  tourName: string;
  /** #8 — for the branded server PDF export route. */
  tourId: string;
};

export function BudgetExportControls({
  lines,
  tourCurrency,
  tourName,
  tourId,
}: BudgetExportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const display = (searchParams.get('display') ?? tourCurrency).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  // The viewed version (if the user is on a historical `?version=` view) — the
  // PDF's projected baseline matches what's on screen (#8 D1).
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

  const exportXlsx = useCallback(() => {
    const rows = lines.map((line) => {
      const rowCurrency = (line.currency || tourCurrency).toUpperCase();
      const proposed = Number(line.proposed_cost ?? 0);
      const actual = Number(line.actual_cost ?? 0);
      return {
        Item: line.label,
        Category: line.category,
        Quantity: line.quantity,
        'Estimated (native)': proposed,
        'Actual (native)': actual,
        Currency: rowCurrency,
        [`Estimated (${display})`]: convertToCurrency(proposed, rowCurrency, display),
        [`Actual (${display})`]: convertToCurrency(actual, rowCurrency, display),
        Status: line.status ?? '',
        Notes: line.notes ?? '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Budget');
    XLSX.writeFile(wb, `${tourName.replace(/[^\w\s-]/g, '').slice(0, 60) || 'budget'}.xlsx`);
    setMenuOpen(false);
  }, [lines, tourCurrency, tourName, display]);

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
        style={{
          borderColor: 'var(--lp-border)',
          color: 'var(--lp-text)',
        }}
        aria-label="Display currency"
      >
        {DISPLAY_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code}>
            {opt.label}
          </option>
        ))}
      </select>

      <div className="relative ml-auto">
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="btn-transition inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm"
          style={{
            borderColor: 'var(--color-lp-orange)',
            color: 'var(--color-lp-orange)',
            background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
            fontWeight: 'var(--lp-weight-medium)',
          }}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Download className="h-4 w-4" aria-hidden />
          Export
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-48 rounded-xl border py-1 shadow-lg"
            style={{
              zIndex: 'var(--lp-z-dropdown)',
              borderColor: 'var(--lp-border)',
              background: 'var(--lp-surface)',
            }}
            onMouseLeave={() => setMenuOpen(false)}
          >
            <button
              type="button"
              onClick={exportXlsx}
              className="btn-transition flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              style={{ color: 'var(--lp-text)' }}
            >
              <FileSpreadsheet
                className="h-4 w-4"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-hidden
              />
              XLSX
            </button>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setPdfOpen(true);
              }}
              className="btn-transition flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              style={{ color: 'var(--lp-text)' }}
            >
              <FileText
                className="h-4 w-4"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-hidden
              />
              Branded PDF…
            </button>
          </div>
        ) : null}
      </div>

      {pdfOpen ? (
        <ExportDialog tourId={tourId} versionId={viewedVersionId} onClose={() => setPdfOpen(false)} />
      ) : null}
    </div>
  );
}
