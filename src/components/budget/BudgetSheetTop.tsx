'use client';

/* ============================================
   LOWPASS — <BudgetSheetTop> (Oct 2026, after Adam's SUMMARY tab)

   The top of the budget sheet, laid out like the Google Sheets template:

     ┌ TOTALS ──────────── PROPOSED  ACTUAL ┐  ┌ COMMISSIONS ─ % · base · PROPOSED · ACTUAL ┐
     │ one row per section                   │  │ Management / Agency / Legal / Merch …       │
     │ Commissions                           │  │ + Add commission            TOTAL           │
     │ Accountancy [ 0 %]                    │  └─────────────────────────────────────────────┘
     │ Insurance   [ 0 %]                    │
     │ Contingency [ 2 %]                    │
     │ TOTAL EXPENSES                        │
     │ Income · Net                          │
     └───────────────────────────────────────┘

   WHERE THINGS ARE TYPED. Overhead percentages and commissions are entered
   HERE, next to the totals they change — not in Tour settings, and not as
   £0 rows in the grid (the old Commissions / Insurance / Contingency
   sections). Tour settings still shows the same values; both write the same
   rows (budget_settings, budget_commissions).

   ONE FORMULA. Every figure is computeBudgetPnl over the page's own inputs,
   recomputed on each keystroke, so the block can't drift from the P&L. The
   section rows are sheetTotalsBySection, whose sum is pinned to
   pnl.baseExpenses by test.

   Saves are optimistic: applied at once, persisted in the background, rolled
   back with a toast if the server refuses.
   ============================================ */

import { useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { computeBudgetPnl, type CommissionInput, type IncomeInput, type PnlSettingsInput } from '@/lib/budget/computeBudgetPnl';
import { sheetTotalsBySection } from '@/lib/budget/sheetTotals';
import type { FxRateMap } from '@/lib/budget/fxRates';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import type { BudgetLineItem, BudgetSection } from '@/types';

export const COMMISSION_BASES = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'gross_merch', label: 'Merch' },
  { value: 'net_merch', label: 'Net merch' },
  { value: 'gross_minus_tax', label: 'Pre-tax' },
];

type Overhead = 'accountancy' | 'insurance' | 'contingency';
const OVERHEADS: Array<{ key: Overhead; label: string }> = [
  { key: 'accountancy', label: 'Accountancy' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'contingency', label: 'Contingency' },
];

interface CommissionRow {
  id: string;
  label: string;
  percentage: number;
  basis: string;
}

export interface BudgetSheetTopProps {
  tourId: string;
  tourCurrency: string;
  lines: BudgetLineItem[];
  sections: BudgetSection[];
  income: IncomeInput[];
  commissions: CommissionInput[];
  settings: Record<string, unknown> | null;
  fxRates: FxRateMap;
  /** An approved (locked) version: figures still show, nothing is editable. */
  readOnly?: boolean;
}

/** £1,234.56 / -£1,234.56 — sign before the symbol. */
export function money(n: number, ccy: string): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return v < 0 ? `-${formatCurrency(-v, ccy)}` : formatCurrency(v, ccy);
}

/** Fraction → the number shown in a % box (0.025 → 2.5). */
const toPctBox = (f: number) => +((Number(f) || 0) * 100).toFixed(2);

function PctInput({
  value,
  onCommit,
  label,
  disabled,
}: {
  value: number;
  onCommit: (fraction: number) => void;
  label: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(toPctBox(value));
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    setDraft(null);
    if (!Number.isFinite(n) || n < 0) return;
    if (Math.abs(n / 100 - value) > 1e-9) onCommit(n / 100);
  };
  return (
    <span className="inline-flex items-center gap-0.5">
      <input
        aria-label={`${label} percentage`}
        inputMode="decimal"
        disabled={disabled}
        value={shown}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={commit}
        onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setDraft(null);
        }}
        className="w-12 rounded border border-lp-border bg-lp-bg px-1.5 py-0.5 text-right tabular-nums text-lp-text outline-none focus:border-lp-orange disabled:opacity-60"
        style={{ fontSize: 'var(--lp-text-sm)' }}
      />
      <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-sm)' }}>%</span>
    </span>
  );
}

export function BudgetSheetTop({
  tourId,
  tourCurrency,
  lines,
  sections,
  income,
  commissions: initialCommissions,
  settings: initialSettings,
  fxRates,
  readOnly = false,
}: BudgetSheetTopProps) {
  const { showToast } = useToast();
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const [settings, setSettings] = useState<PnlSettingsInput>(() => ({ ...(initialSettings ?? {}) }) as PnlSettingsInput);
  const [rows, setRows] = useState<CommissionRow[]>(() =>
    initialCommissions.map((c) => ({
      id: c.id,
      label: c.label,
      percentage: Number(c.percentage) || 0,
      basis: c.basis || 'gross',
    })),
  );
  const [busy, setBusy] = useState(false);

  const pnl = useMemo(
    () => computeBudgetPnl({ lines, income, commissions: rows, settings, tourCurrency: ccy, fxRates }),
    [lines, income, rows, settings, ccy, fxRates],
  );
  const sectionRows = useMemo(() => sheetTotalsBySection(lines, sections, ccy, fxRates), [lines, sections, ccy, fxRates]);
  const commByid = useMemo(() => new Map(pnl.commissionRows.map((c) => [c.id, c])), [pnl.commissionRows]);

  const saveOverhead = (key: Overhead, fraction: number) => {
    const field = `${key}_pct` as const;
    const before = settings;
    setSettings((s) => ({ ...s, [field]: fraction }));
    void (async () => {
      try {
        const res = await fetch('/api/budget/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, [field]: fraction }),
        });
        if (!res.ok) throw new Error(`Could not save ${key} (${res.status})`);
      } catch (err) {
        setSettings(before);
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    })();
  };

  const patchCommission = (id: string, fields: Partial<Omit<CommissionRow, 'id'>>) => {
    const before = rows;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, ...fields } : x)));
    void (async () => {
      try {
        const res = await fetch('/api/budget/commissions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, ...fields }),
        });
        if (!res.ok) throw new Error(`Could not save commission (${res.status})`);
      } catch (err) {
        setRows(before);
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    })();
  };

  const addCommission = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/budget/commissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, label: 'Commission', percentage: 0, basis: 'gross' }),
      });
      if (!res.ok) throw new Error(`Could not add commission (${res.status})`);
      const c = (await res.json()) as CommissionRow;
      setRows((r) => [...r, { id: c.id, label: c.label, percentage: Number(c.percentage) || 0, basis: c.basis || 'gross' }]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Add failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const removeCommission = (row: CommissionRow) => {
    const before = rows;
    setRows((r) => r.filter((x) => x.id !== row.id));
    void (async () => {
      try {
        const res = await fetch('/api/budget/commissions', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id }),
        });
        if (!res.ok) throw new Error(`Could not delete commission (${res.status})`);
      } catch (err) {
        setRows(before);
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    })();
  };

  const num = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap';
  const lbl = 'px-3 py-1.5 text-lp-text';
  const head = 'px-3 pb-1.5 pt-2 text-left font-medium text-lp-text-tertiary';
  const totalRow = 'border-t border-lp-border font-semibold';
  const cell = { fontSize: 'var(--lp-text-sm)' } as const;

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]" data-testid="budget-sheet-top">
      {/* ── Totals ───────────────────────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-lp-border bg-lp-surface" aria-label="Budget totals">
        <table className="w-full border-collapse" style={cell}>
          <thead>
            <tr>
              <th className={head}>Totals</th>
              <th className={`${head} text-right`}>Proposed</th>
              <th className={`${head} text-right`}>Actual</th>
            </tr>
          </thead>
          <tbody>
            {sectionRows.map((r) => (
              <tr key={r.id} className="border-t border-lp-border/60">
                <td className={lbl}>{r.name}</td>
                <td className={num}>{money(r.projected, ccy)}</td>
                <td className={num}>{money(r.actual, ccy)}</td>
              </tr>
            ))}
            <tr className="border-t border-lp-border/60">
              <td className={lbl}>Commissions</td>
              <td className={num}>{money(pnl.commissions.projected, ccy)}</td>
              <td className={num}>{money(pnl.commissions.actual, ccy)}</td>
            </tr>
            {OVERHEADS.map((o) => (
              <tr key={o.key} className="border-t border-lp-border/60">
                <td className={lbl}>
                  <span className="inline-flex items-center gap-2">
                    {o.label}
                    <PctInput
                      label={o.label}
                      value={Number(settings[`${o.key}_pct`]) || 0}
                      disabled={readOnly}
                      onCommit={(f) => saveOverhead(o.key, f)}
                    />
                  </span>
                </td>
                <td className={num}>{money(pnl[o.key].projected, ccy)}</td>
                <td className={num}>{money(pnl[o.key].actual, ccy)}</td>
              </tr>
            ))}
            {pnl.cogs.projected !== 0 || pnl.cogs.actual !== 0 ? (
              <tr className="border-t border-lp-border/60">
                <td className={lbl}>Merch cost of goods</td>
                <td className={num}>{money(pnl.cogs.projected, ccy)}</td>
                <td className={num}>{money(pnl.cogs.actual, ccy)}</td>
              </tr>
            ) : null}
            <tr className={totalRow} data-testid="sheet-total-expenses">
              <td className={lbl}>Total expenses</td>
              <td className={num}>{money(pnl.totalExpenses.projected, ccy)}</td>
              <td className={num}>{money(pnl.totalExpenses.actual, ccy)}</td>
            </tr>
            <tr className="border-t border-lp-border/60">
              <td className={`${lbl} text-lp-text-secondary`}>Income</td>
              <td className={`${num} text-lp-text-secondary`}>{money(pnl.grossIncome.projected, ccy)}</td>
              <td className={`${num} text-lp-text-secondary`}>{money(pnl.grossIncome.actual, ccy)}</td>
            </tr>
            <tr className={totalRow} data-testid="sheet-net">
              <td className={lbl}>Net</td>
              {(['projected', 'actual'] as const).map((k) => (
                <td
                  key={k}
                  className={num}
                  style={{ color: pnl.net[k] < 0 ? 'var(--color-lp-error)' : 'var(--lp-text)' }}
                >
                  {money(pnl.net[k], ccy)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </section>

      {/* ── Commissions ──────────────────────────────────────── */}
      <section className="overflow-hidden rounded-lg border border-lp-border bg-lp-surface" aria-label="Commissions">
        <table className="w-full border-collapse" style={cell}>
          <thead>
            <tr>
              <th className={head}>Commissions</th>
              <th className={`${head} text-right`}>%</th>
              <th className={head}>Of</th>
              <th className={`${head} text-right`}>Proposed</th>
              <th className={`${head} text-right`}>Actual</th>
              <th className={head} aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr className="border-t border-lp-border/60">
                <td colSpan={6} className="px-3 py-3 text-lp-text-tertiary">
                  No commissions. Add management, agency, legal or merch below.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const c = commByid.get(r.id);
                return (
                  <tr key={r.id} className="border-t border-lp-border/60" data-testid="sheet-commission-row">
                    <td className="px-2 py-1">
                      <input
                        aria-label="Commission name"
                        defaultValue={r.label}
                        disabled={readOnly}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v && v !== r.label) patchCommission(r.id, { label: v });
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        className="w-full min-w-0 rounded border border-transparent bg-transparent px-1 py-0.5 text-lp-text outline-none hover:border-lp-border focus:border-lp-orange"
                      />
                    </td>
                    <td className="px-2 py-1 text-right">
                      <PctInput
                        label={r.label}
                        value={r.percentage}
                        disabled={readOnly}
                        onCommit={(f) => patchCommission(r.id, { percentage: f })}
                      />
                    </td>
                    <td className="px-2 py-1">
                      <select
                        aria-label={`${r.label} is a percentage of`}
                        value={r.basis}
                        disabled={readOnly}
                        onChange={(e) => patchCommission(r.id, { basis: e.target.value })}
                        className="rounded border border-lp-border bg-lp-bg px-1.5 py-0.5 text-lp-text outline-none focus:border-lp-orange"
                      >
                        {COMMISSION_BASES.map((b) => (
                          <option key={b.value} value={b.value}>{b.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className={num}>{money(c?.projected ?? 0, ccy)}</td>
                    <td className={num}>{money(c?.actual ?? 0, ccy)}</td>
                    <td className="px-1 py-1 text-right">
                      {!readOnly ? (
                        <button
                          type="button"
                          aria-label={`Remove ${r.label}`}
                          onClick={() => removeCommission(r)}
                          className="rounded p-1 text-lp-text-tertiary hover:text-lp-text"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })
            )}
            <tr className={totalRow}>
              <td className="px-2 py-1.5" colSpan={3}>
                {!readOnly ? (
                  <button
                    type="button"
                    onClick={() => void addCommission()}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-lp-text-secondary hover:text-lp-text disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add commission
                  </button>
                ) : null}
              </td>
              <td className={num}>{money(pnl.commissions.projected, ccy)}</td>
              <td className={num}>{money(pnl.commissions.actual, ccy)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
