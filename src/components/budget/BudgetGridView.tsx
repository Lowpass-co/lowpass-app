'use client';

/* ============================================
   LOWPASS — <BudgetGridView> (Phase 3, Stage B mount)

   The canonical <Grid> + <GridSlideOver> on the REAL Budget Expenses data.
   Reads via the budgetAdapter (DB rows → grid Section[]); persists cell /
   slide edits via the existing /api/budget/line-items PATCH route
   (optimistic — the grid already shows the value; only failures refresh).

   Decisions (PHASE3_BUDGET_MAP.md): status stays the DB set; derived lines
   (Payroll/Rooming/…) lock est+act; no vendor column; FX from
   src/lib/budget/fx.ts; formula sections live on the Summary tab (excluded).
   ============================================ */

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Grid } from '@/components/grid/Grid';
import type { Column, GridFx, GridStatusConfig } from '@/components/grid/types';
import { budgetToGridSections, gridEditToPatch } from '@/lib/grid/budgetAdapter';
import { convertToCurrency } from '@/lib/budget/fx';
import { useToast } from '@/components/ui/Toast';
import type { BudgetLineItem, BudgetSection } from '@/types';

/** DB status set (decision 1 — kept, no migration). */
const STATUS_OPTIONS = ['draft', 'quoted', 'approved', 'paid', 'disputed'];
const STATUS_COLORS: Record<string, string> = {
  draft: 'var(--lp-text-tertiary)',
  quoted: 'var(--color-lp-warning)',
  approved: 'var(--color-lp-info)',
  paid: 'var(--color-lp-success)',
  disputed: 'var(--color-lp-error)',
};
const STATUS_CONFIG: GridStatusConfig = { options: STATUS_OPTIONS, colors: STATUS_COLORS };

const CUR_SYMBOL: Record<string, string> = { GBP: '£', USD: '$', EUR: '€', CAD: 'C$', AUD: 'A$', JPY: '¥' };
const CURRENCIES = ['GBP', 'USD', 'EUR', 'CAD', 'AUD', 'JPY'];

/** Expenses column set — no vendor (decision 3), no day-type. */
const EXPENSE_COLS: Column[] = [
  { id: 'idx', label: '#', type: 'idx', w: 46, min: 40, resize: false },
  { id: 'item', label: 'Item', type: 'text', w: 320, min: 160, resize: true },
  { id: 'est', label: 'Estimate', type: 'money', w: 120, min: 90, resize: true },
  { id: 'act', label: 'Actual', type: 'money', w: 120, min: 90, resize: true },
  { id: 'var', label: 'Variance', type: 'variance', w: 110, min: 90, resize: true },
  { id: 'status', label: 'Status', type: 'status', w: 130, min: 100, resize: true, options: STATUS_OPTIONS, optColors: STATUS_COLORS },
  { id: 'rcpts', label: 'Receipts', type: 'receipts', w: 90, min: 70, resize: false },
  { id: 'notes', label: 'Notes', type: 'text', w: 220, min: 120, resize: true, hidden: true },
];

export interface BudgetGridViewProps {
  lines: BudgetLineItem[];
  sections: BudgetSection[];
  tourCurrency: string;
  tourId: string;
}

export function BudgetGridView({ lines, sections, tourCurrency, tourId }: BudgetGridViewProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const display = (tourCurrency || 'USD').toUpperCase();

  const fx: GridFx = {
    displayCurrency: display,
    currencies: CURRENCIES,
    toDisplay: (amount, from) => convertToCurrency(amount, (from || display).toUpperCase(), display),
    symbol: (cur) => CUR_SYMBOL[(cur || display).toUpperCase()] ?? `${(cur || display).toUpperCase()} `,
    formatDisplay: (amount) =>
      (CUR_SYMBOL[display] ?? `${display} `) + Math.round(Number(amount) || 0).toLocaleString('en-US'),
  };

  const data = budgetToGridSections(lines, sections, { tourCurrency: display, ungroupedName: 'Uncategorised' });

  // Persist a single cell / slide edit. Optimistic — the grid already shows
  // the new value; a rejected write surfaces a toast + a refresh to true state.
  const onEdit = useCallback(
    (rowUid: string, field: string, value: unknown) => {
      const patch = gridEditToPatch(field, value);
      if (!patch) return; // non-persisting field (idx/variance/receipts/vendor)
      void fetch('/api/budget/line-items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowUid, ...patch }),
      })
        .then((res) => {
          if (!res.ok) {
            showToast('Could not save the change', 'error');
            router.refresh();
          }
        })
        .catch(() => {
          showToast('Could not save the change', 'error');
          router.refresh();
        });
    },
    [router, showToast],
  );

  // Structural CRUD: POST/DELETE then refresh (the new row needs a real id;
  // rename is a PATCH with no refresh — the grid already shows it).
  const refreshOnFail = (res: Response) => {
    if (!res.ok) {
      showToast('Could not save the change', 'error');
    }
    router.refresh();
  };

  const onAddLine = useCallback(
    (sectionUid: string) => {
      void fetch('/api/budget/line-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tour_id: tourId,
          category: 'misc',
          label: 'New line item',
          section_id: sectionUid === 'ungrouped' ? null : sectionUid,
          currency: display,
        }),
      })
        .then(refreshOnFail)
        .catch(() => {
          showToast('Could not add the line', 'error');
        });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tourId, display],
  );

  const onAddSection = useCallback(() => {
    void fetch('/api/budget/sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tour_id: tourId, name: 'New section', kind: 'custom', sort_order: sections.length }),
    })
      .then(refreshOnFail)
      .catch(() => {
        showToast('Could not add the section', 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourId, sections.length]);

  const onRenameSection = useCallback((sectionUid: string, name: string) => {
    if (sectionUid === 'ungrouped') return;
    void fetch('/api/budget/sections', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sectionUid, name }),
    }).catch(() => undefined); // optimistic; the grid already renamed locally
  }, []);

  const onDeleteRow = useCallback((rowUid: string) => {
    void fetch(`/api/budget/line-items?id=${encodeURIComponent(rowUid)}`, { method: 'DELETE' })
      .then(refreshOnFail)
      .catch(() => {
        showToast('Could not delete the line', 'error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Grid
      // re-init when the line/section COUNT changes (add/delete via a refresh);
      // cell edits don't change counts, so the grid keeps its session state.
      key={`${tourId}:${lines.length}:${sections.length}`}
      initialColumns={EXPENSE_COLS}
      initialData={data}
      fx={fx}
      slideStatuses={STATUS_CONFIG}
      slideLineVariant
      onEdit={onEdit}
      onAddLine={onAddLine}
      onAddSection={onAddSection}
      onRenameSection={onRenameSection}
      onDeleteRow={onDeleteRow}
    />
  );
}
