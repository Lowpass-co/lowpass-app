/* ============================================
   LOWPASS — Budget export controls (Phase F budget redesign)

   Page-header strip with:
     - display-currency switcher (?display=USD|GBP|EUR — converts the
       UI numbers via lib/budget/fx; underlying data unchanged)
     - "Export…" menu (XLSX flat dump or PDF summary)

   Exports run entirely client-side using the already-installed
   xlsx + jspdf libraries. PDF intentionally simple (table dump with
   header line); the rich variant-style "summary with charts" is a
   follow-up that needs the chart components rendered to canvas.
   ============================================ */

'use client';

import { useCallback, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Download, FileSpreadsheet, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import { convertToCurrency } from '@/lib/budget/fx';
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
};

function abbrevFmt(value: number, currency: string): string {
  return value.toLocaleString('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  });
}

export function BudgetExportControls({
  lines,
  tourCurrency,
  tourName,
}: BudgetExportControlsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const display = (searchParams.get('display') ?? tourCurrency).toUpperCase();
  const [menuOpen, setMenuOpen] = useState(false);

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

  const exportPdf = useCallback(() => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(16);
    doc.text(`${tourName} — Budget`, 40, 40);
    doc.setFontSize(10);
    doc.setTextColor(110);
    doc.text(
      `Display currency: ${display}${display !== tourCurrency.toUpperCase() ? ` (converted from ${tourCurrency})` : ''}`,
      40,
      58,
    );
    doc.setTextColor(0);

    let y = 90;
    const colX = [40, 220, 340, 430, 520, 610, 700];
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    ['Item', 'Category', 'Status', 'Currency', 'Estimated', 'Actual', 'Variance'].forEach(
      (label, i) => doc.text(label, colX[i], y),
    );
    doc.setFont('helvetica', 'normal');
    y += 14;

    let totalEst = 0;
    let totalAct = 0;
    for (const line of lines) {
      if (y > 540) {
        doc.addPage();
        y = 60;
      }
      const rowCurrency = (line.currency || tourCurrency).toUpperCase();
      const est = convertToCurrency(Number(line.proposed_cost ?? 0), rowCurrency, display);
      const act = convertToCurrency(Number(line.actual_cost ?? 0), rowCurrency, display);
      totalEst += est;
      totalAct += act;
      const variance = est > 0 ? ((act - est) / est) * 100 : 0;
      doc.text((line.label ?? '').slice(0, 36), colX[0], y);
      doc.text(((line.category ?? '') as string).slice(0, 18), colX[1], y);
      doc.text((line.status ?? '—').toString(), colX[2], y);
      doc.text(rowCurrency, colX[3], y);
      doc.text(abbrevFmt(est, display), colX[4], y);
      doc.text(abbrevFmt(act, display), colX[5], y);
      doc.text(`${variance.toFixed(1)}%`, colX[6], y);
      y += 14;
    }

    if (y > 520) {
      doc.addPage();
      y = 60;
    }
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Totals', colX[0], y);
    doc.text(abbrevFmt(totalEst, display), colX[4], y);
    doc.text(abbrevFmt(totalAct, display), colX[5], y);

    doc.save(`${tourName.replace(/[^\w\s-]/g, '').slice(0, 60) || 'budget'}.pdf`);
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
              onClick={exportPdf}
              className="btn-transition flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
              style={{ color: 'var(--lp-text)' }}
            >
              <FileText
                className="h-4 w-4"
                style={{ color: 'var(--lp-text-tertiary)' }}
                aria-hidden
              />
              PDF summary
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
