'use client';

/* ============================================
   LOWPASS — <BudgetSheetTop> (Oct 2026; redrawn Nov 2026, Adam)

   ONE panel above the grid, in the tour Overview's style (light panel,
   hairline rows — budgetSheet.css):

     Income · Costs · Net          ← proposed big, actual so far under each
     ─────────────────────────────
     Where it goes                 ← one row per section: proposed, spent, a
                                     spend bar; a click scrolls the grid to it
     ─────────────────────────────
     Commissions · 3 ……  £18,240 ▾ ← FOLDED: set once a tour, so a row that
     Overheads · 2% …… £3,040 ▾      opens its editor in place (Adam: "big
     Income · show, merch … ▾        left, commission big right ain't great")
     Deposits owed back (if any)

   Nothing was taken away: every figure and every input of the old two-table
   layout is still here, behind its row. Income / expenses / net are shown
   ONCE (they used to repeat under the totals table too).

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

   MIGRATION 274 OPTIONS (from the USA '26 business-manager reconciliation):
     • a commission ticks the parts of income it is a % of (show / merch /
       VIP / other) and whether show income is measured before tax — or keeps
       one legacy base;
     • each overhead is a % OR a fixed amount, and its actual can be typed
       (the real invoice) — blank = the calculation;
     • income is broken down (show / merch / VIP / other), with an
       "Add other income" section for buy-ons and sponsorship;
     • refundable deposits still owed back show under Net, outside costs.
   ============================================ */

import { Fragment, useMemo, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import './budgetSheet.css';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, X } from 'lucide-react';
import {
  computeBudgetPnl,
  normalizeComponents,
  type CommissionInput,
  type IncomeInput,
  type PnlSettingsInput,
} from '@/lib/budget/computeBudgetPnl';
import { sheetTotalsBySection } from '@/lib/budget/sheetTotals';
import type { FxRateMap } from '@/lib/budget/fxRates';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/components/ui/Toast';
import { COMMISSION_COMPONENTS, type BudgetLineItem, type BudgetSection, type CommissionComponent } from '@/types';

export const COMMISSION_BASES = [
  { value: 'gross', label: 'Gross' },
  { value: 'net', label: 'Net' },
  { value: 'gross_merch', label: 'Merch' },
  { value: 'net_merch', label: 'Net merch' },
  { value: 'gross_minus_tax', label: 'Pre-tax' },
];

const COMPONENT_LABEL: Record<CommissionComponent, string> = {
  show: 'Show',
  merch: 'Merch',
  vip: 'VIP',
  other: 'Other',
};
const COMPONENT_HINT: Record<CommissionComponent, string> = {
  show: 'Show income (guarantees + overages)',
  merch: 'Merch (after cost of goods)',
  vip: 'VIP',
  other: 'Other income lines marked commissionable',
};

/** What a commission is a % of, in a few words. */
export function commissionBaseSummary(components: CommissionComponent[] | null, basis: string, preTax: boolean): string {
  if (components && components.length) {
    return components
      .map((c) => (c === 'show' && preTax ? 'Show (pre-tax)' : COMPONENT_LABEL[c]))
      .join(' + ');
  }
  return COMMISSION_BASES.find((b) => b.value === basis)?.label ?? basis;
}

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
  /** Migration 274 — ticked parts (null = the legacy `basis`). */
  basis_components: CommissionComponent[] | null;
  basis_pre_tax: boolean;
}

const toRow = (c: CommissionInput): CommissionRow => ({
  id: c.id,
  label: c.label,
  percentage: Number(c.percentage) || 0,
  basis: c.basis || 'gross',
  basis_components: normalizeComponents(c.basis_components),
  basis_pre_tax: c.basis_pre_tax !== false,
});

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
        className="h-7 w-12 rounded border border-lp-border bg-lp-bg px-1.5 text-right tabular-nums text-lp-text outline-none focus:border-lp-orange disabled:opacity-60"
        style={{ fontSize: 'var(--lp-text-sm)' }}
      />
      <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-sm)' }}>%</span>
    </span>
  );
}

/** A money box: typed figure or blank (= null). Used for a fixed overhead and a
 *  typed actual. Commits on blur / Enter; Escape abandons the edit. */
function MoneyInput({
  value,
  onCommit,
  label,
  placeholder,
  disabled,
}: {
  value: number | null;
  onCommit: (v: number | null) => void;
  label: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value == null ? '' : String(+value.toFixed(2)));
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    const t = draft.trim();
    if (t === '') {
      if (value != null) onCommit(null);
      return;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return;
    if (value == null || Math.abs(n - value) > 0.004) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      disabled={disabled}
      value={shown}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value.replace(/[^0-9.]/g, ''))}
      onBlur={commit}
      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setDraft(null);
      }}
      className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-right tabular-nums text-lp-text outline-none placeholder:text-lp-text-tertiary hover:border-lp-border focus:border-lp-orange disabled:opacity-60"
    />
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
  const router = useRouter();
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const [settings, setSettings] = useState<PnlSettingsInput>(() => ({ ...(initialSettings ?? {}) }) as PnlSettingsInput);
  const [rows, setRows] = useState<CommissionRow[]>(() => initialCommissions.map(toRow));
  const [busy, setBusy] = useState(false);
  /** The commission whose base editor is open (one at a time). */
  const [baseOpen, setBaseOpen] = useState<string | null>(null);

  const pnl = useMemo(
    () => computeBudgetPnl({ lines, income, commissions: rows, settings, tourCurrency: ccy, fxRates }),
    [lines, income, rows, settings, ccy, fxRates],
  );
  const sectionRows = useMemo(
    () => sheetTotalsBySection(lines, sections, ccy, fxRates, pnl.fxMarginPct),
    [lines, sections, ccy, fxRates, pnl.fxMarginPct],
  );
  const hasIncomeSection = sections.some((s) => s.kind === 'income');
  const commByid = useMemo(() => new Map(pnl.commissionRows.map((c) => [c.id, c])), [pnl.commissionRows]);

  /** Optimistic settings save — the same row Tour settings writes. */
  const saveSettings = (fields: Partial<PnlSettingsInput>, what: string) => {
    const before = settings;
    setSettings((s) => ({ ...s, ...fields }));
    void (async () => {
      try {
        const res = await fetch('/api/budget/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tour_id: tourId, ...fields }),
        });
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Could not save ${what} (${res.status})`);
        }
      } catch (err) {
        setSettings(before);
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    })();
  };
  const saveOverhead = (key: Overhead, fraction: number) => saveSettings({ [`${key}_pct`]: fraction }, key);

  const addOtherIncome = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/budget/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tour_id: tourId, name: 'Other income', kind: 'income' }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error || `Could not add Other income (${res.status})`);
      }
      showToast('Other income added — add its lines in the grid below', 'success');
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Add failed', 'error');
    } finally {
      setBusy(false);
    }
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
        if (!res.ok) {
          const j = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(j?.error || `Could not save commission (${res.status})`);
        }
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
      const c = (await res.json()) as CommissionInput;
      setRows((r) => [...r, toRow(c)]);
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

  // Inner editor tables (inside the folds): one fixed row height, every % box
  // in its own column, so nothing shifts with a label's length (Oct 2026).
  const num = 'px-3 text-right tabular-nums whitespace-nowrap';
  const lbl = 'px-3 text-lp-text whitespace-nowrap';
  const pctCell = 'px-2 text-right';
  const tr = 'h-9 border-t border-lp-border/60';
  const head = 'bs-th h-8 px-3 text-left';
  const totalRow = 'h-10 border-t border-lp-border font-semibold';
  const cell = { fontSize: 'var(--lp-text-sm)' } as const;
  const negative = (n: number) => (n < 0 ? 'var(--color-lp-error)' : undefined);
  const [open, setOpen] = useState<Record<'commissions' | 'overheads' | 'income', boolean>>({
    commissions: false,
    overheads: false,
    income: false,
  });
  const flip = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  const figures: Array<{ id: string; label: string; v: { projected: number; actual: number } }> = [
    { id: 'income', label: 'Income', v: pnl.grossIncome },
    { id: 'expenses', label: 'Total expenses', v: pnl.totalExpenses },
    { id: 'net', label: 'Net', v: pnl.net },
  ];

  // Income broken down — the parts sum to the Income total (pinned by the P&L
  // test: show (after tax and settlement deductions) + merch + VIP + other).
  const nonZero = (v: { projected: number; actual: number }) => Math.abs(v.projected) > 0.004 || Math.abs(v.actual) > 0.004;
  const incomeParts: Array<{ id: string; label: string; v: { projected: number; actual: number }; title?: string }> = [
    {
      id: 'show',
      label: 'Show income',
      v: pnl.showIncome.postTax,
      title: `After withholding tax and settlement deductions. Before tax: ${money(pnl.showIncome.preTax.projected, ccy)} proposed · ${money(pnl.showIncome.preTax.actual, ccy)} actual`,
    },
    ...(nonZero(pnl.incomeBreakdown.merch) ? [{ id: 'merch', label: 'Merch income', v: pnl.incomeBreakdown.merch }] : []),
    ...(nonZero(pnl.incomeBreakdown.vip) ? [{ id: 'vip', label: 'VIP income', v: pnl.incomeBreakdown.vip }] : []),
    ...(hasIncomeSection || nonZero(pnl.incomeBreakdown.other) || !readOnly
      ? [{ id: 'other', label: 'Other income', v: pnl.incomeBreakdown.other, title: 'Support buy-ons, sponsorship — the Other income section in the grid' }]
      : []),
  ];
  const depositRows: Array<{ id: string; label: string; v: { projected: number; actual: number }; title: string }> = [
    ...(nonZero(pnl.deposits.owedBack)
      ? [{ id: 'owed', label: 'Deposits owed back', v: pnl.deposits.owedBack, title: 'Refundable deposits not yet returned — kept out of costs. Mark a line forfeited if the supplier keeps it.' }]
      : []),
    ...(nonZero(pnl.deposits.returned)
      ? [{ id: 'returned', label: 'Deposits returned', v: pnl.deposits.returned, title: 'Refundable deposits that came back — not a cost.' }]
      : []),
  ];

  const overheadSummary =
    OVERHEADS.filter((o) => Math.abs(pnl[o.key].projected) > 0.004)
      .map((o) =>
        pnl.mode[o.key] === 'flat'
          ? `${o.label} ${money(pnl[o.key].projected, ccy)}`
          : `${o.label} ${toPctBox(Number(settings[`${o.key}_pct`]) || 0)}%`,
      )
      .join(' · ') || 'None set';
  const overheadTotal = {
    projected: OVERHEADS.reduce((t, o) => t + pnl[o.key].projected, 0) + pnl.cogs.projected,
    actual: OVERHEADS.reduce((t, o) => t + pnl[o.key].actual, 0) + pnl.cogs.actual,
  };
  const commissionSummary = rows.length
    ? rows.map((r) => `${r.label} ${toPctBox(r.percentage)}%`).join(' · ')
    : 'None yet';
  const incomeSummary = incomeParts
    .filter((p) => nonZero(p.v))
    .map((p) => p.label.replace(/ income$/, ''))
    .join(' · ') || 'No income yet';

  /** Scroll the grid to a section (grouped by section; otherwise a no-op). */
  const goToSection = (id: string) => {
    const uid = id === '__uncat__' ? 'ungrouped' : id;
    const el = document.querySelector<HTMLElement>(`#gr-sections > .section[data-uid="${CSS.escape(uid)}"]`);
    if (!el) return;
    el.classList.add('bs-scroll-target');
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fold = (
    key: keyof typeof open,
    label: string,
    summary: string,
    v: { projected: number; actual: number },
    body: ReactNode,
  ) => (
    <div className="bs-fold" data-testid={`sheet-fold-${key}`}>
      <button
        type="button"
        className="bs-fold-row"
        aria-expanded={open[key]}
        onClick={() => flip(key)}
      >
        <span className="bs-fold-name">{label}</span>
        <span className="bs-fold-summary">{summary}</span>
        <span className="bs-fold-money">
          <span>{money(v.projected, ccy)}</span>
          <span className="bs-sub">{money(v.actual, ccy)} so far</span>
        </span>
        <ChevronDown className={`bs-chev${open[key] ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open[key] ? <div className="bs-fold-body">{body}</div> : null}
    </div>
  );

  return (
    <section className="bs-panel" aria-label="Budget totals" data-testid="budget-sheet-top">
      {/* ── The bottom line, once ─────────────────────────── */}
      <div className="bs-figures" aria-label="Bottom line">
        {figures.map((f) => (
          <div key={f.id} className="bs-fig" data-testid={`sheet-headline-${f.id}`}>
            <span className="bs-label">{f.label}</span>
            <span
              className="bs-big"
              data-testid={f.id === 'expenses' ? 'sheet-total-expenses' : f.id === 'net' ? 'sheet-net' : undefined}
              style={{ color: f.id === 'net' ? negative(f.v.projected) : undefined }}
            >
              {money(f.v.projected, ccy)}
            </span>
            <span className="bs-sub">{money(f.v.actual, ccy)} actual so far</span>
          </div>
        ))}
      </div>

      {/* ── Where it goes ─────────────────────────────────── */}
      {sectionRows.length ? (
        <div className="bs-block">
          <p className="bs-label">Where it goes</p>
          <ul className="bs-sections">
            {sectionRows.map((r) => {
              const pct = r.projected > 0 ? Math.min(1, r.actual / r.projected) : r.actual > 0 ? 1 : 0;
              const over = r.actual > r.projected + 0.004;
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    className="bs-sec"
                    data-testid={`sheet-section-${r.id}`}
                    onClick={() => goToSection(r.id)}
                    title={`Show ${r.name} in the grid`}
                  >
                    <span className="bs-sec-name">{r.name}</span>
                    <span className="bs-sec-money">
                      <span className={`bs-sec-spent${over ? ' is-over' : ''}`}>{money(r.actual, ccy)} spent of </span>
                      {money(r.projected, ccy)}
                    </span>
                    <span className="bs-bar" aria-hidden>
                      <span className={`bs-bar-fill${over ? ' is-over' : ''}`} style={{ width: `${Math.round(pct * 100)}%` }} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* ── Commissions (folded) ──────────────────────────── */}
      {fold('commissions', 'Commissions', commissionSummary, pnl.commissions, (
          <table className="w-full table-fixed border-collapse" style={cell}>
            <colgroup>
              <col />
              <col style={{ width: 76 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 120 }} />
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                <th className={head}>Name</th>
                <th className={`${head} text-right`}>%</th>
                <th className={head}>Of</th>
                <th className={`${head} text-right`}>Proposed</th>
                <th className={head} aria-label="Remove" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr className={tr}>
                  <td colSpan={5} className="px-3 text-lp-text-tertiary">
                    None yet — management, agency, legal or merch.
                  </td>
                </tr>
              ) : null}
              {rows.map((r) => {
                  const c = commByid.get(r.id);
                  const summary = commissionBaseSummary(r.basis_components, r.basis, r.basis_pre_tax);
                  const ticked = new Set(r.basis_components ?? []);
                  const toggle = (part: CommissionComponent) => {
                    const next = new Set(ticked);
                    if (next.has(part)) next.delete(part);
                    else next.add(part);
                    patchCommission(r.id, { basis_components: normalizeComponents([...next]) });
                  };
                  return (
                    <Fragment key={r.id}>
                    <tr className={tr} data-testid="sheet-commission-row">
                      <td className="px-2">
                        <input
                          aria-label="Commission name"
                          defaultValue={r.label}
                          disabled={readOnly}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== r.label) patchCommission(r.id, { label: v });
                          }}
                          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                          className="h-7 w-full min-w-0 rounded border border-transparent bg-transparent px-1 text-lp-text outline-none hover:border-lp-border focus:border-lp-orange"
                        />
                      </td>
                      <td className={pctCell}>
                        <PctInput
                          label={r.label}
                          value={r.percentage}
                          disabled={readOnly}
                          onCommit={(f) => patchCommission(r.id, { percentage: f })}
                        />
                      </td>
                      <td className="px-2">
                        <button
                          type="button"
                          aria-expanded={baseOpen === r.id}
                          aria-label={`${r.label} is a percentage of ${summary}`}
                          title={summary}
                          onClick={() => setBaseOpen((o) => (o === r.id ? null : r.id))}
                          className="flex h-7 w-full min-w-0 items-center gap-1 rounded border border-lp-border bg-lp-bg px-1 text-left text-lp-text outline-none hover:border-lp-text-tertiary focus:border-lp-orange"
                          style={{ fontSize: 'var(--lp-text-sm)' }}
                        >
                          <span className="min-w-0 flex-1 truncate">{summary}</span>
                          <ChevronDown className="h-3 w-3 shrink-0 text-lp-text-tertiary" />
                        </button>
                      </td>
                      <td className={num} title={`Actual ${money(c?.actual ?? 0, ccy)}`}>{money(c?.projected ?? 0, ccy)}</td>
                      <td className="px-1 text-right">
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
                    {baseOpen === r.id ? (
                      <tr className="border-t border-lp-border/60" data-testid="sheet-commission-base">
                        <td colSpan={5} className="px-3 py-2" style={{ fontSize: 'var(--lp-text-sm)' }}>
                          <fieldset disabled={readOnly} className="space-y-2">
                            <legend className="mb-1 text-lp-text-secondary">{r.label} is a % of — tick the parts:</legend>
                            <div className="flex flex-wrap gap-x-4 gap-y-1">
                              {COMMISSION_COMPONENTS.map((part) => (
                                <label key={part} className="inline-flex items-center gap-1.5 text-lp-text" title={COMPONENT_HINT[part]}>
                                  <input type="checkbox" checked={ticked.has(part)} onChange={() => toggle(part)} />
                                  {part === 'other' ? 'Other income' : COMPONENT_LABEL[part]}
                                </label>
                              ))}
                            </div>
                            <label className="inline-flex items-center gap-1.5 text-lp-text">
                              <input
                                type="checkbox"
                                checked={r.basis_pre_tax}
                                disabled={!ticked.has('show')}
                                onChange={(e) => patchCommission(r.id, { basis_pre_tax: e.target.checked })}
                              />
                              Show income before withholding tax
                            </label>
                            <div className="flex items-center gap-2 text-lp-text-secondary">
                              <span>{ticked.size ? 'Parts ticked — single base not used' : 'Nothing ticked — one base:'}</span>
                              <select
                                aria-label={`${r.label} single base`}
                                value={r.basis}
                                disabled={readOnly || ticked.size > 0}
                                onChange={(e) => patchCommission(r.id, { basis: e.target.value })}
                                className="h-7 rounded border border-lp-border bg-lp-bg px-1 text-lp-text outline-none focus:border-lp-orange disabled:opacity-50"
                              >
                                {COMMISSION_BASES.map((b) => (
                                  <option key={b.value} value={b.value}>{b.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="tabular-nums text-lp-text-tertiary">
                              Actual so far {money(c?.actual ?? 0, ccy)}
                            </div>
                          </fieldset>
                        </td>
                      </tr>
                    ) : null}
                    </Fragment>
                  );
                })}
              <tr className={totalRow}>
                <td className="px-2" colSpan={3}>
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
                <td />
              </tr>
            </tbody>
          </table>
      ))}

      {/* ── Overheads (folded) ────────────────────────────── */}
      {fold('overheads', 'Overheads', overheadSummary, overheadTotal, (
          <table className="w-full table-fixed border-collapse" style={cell}>
            <colgroup>
              <col />
              <col style={{ width: 84 }} />
              <col style={{ width: 136 }} />
              <col style={{ width: 136 }} />
            </colgroup>
            <thead>
              <tr>
                <th className={head}>Overhead</th>
                <th className={`${head} text-right`}>%</th>
                <th className={`${head} text-right`}>Proposed</th>
                <th className={`${head} text-right`}>Actual</th>
              </tr>
            </thead>
            <tbody>
              {OVERHEADS.map((o) => {
                const flat = pnl.mode[o.key] === 'flat';
                const typedActual = settings[`${o.key}_actual_amount`];
                return (
                  <tr key={o.key} className={tr} data-testid={`sheet-overhead-${o.key}`}>
                    <td className={lbl}>
                      <span>{o.label}</span>
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={() =>
                            saveSettings({ [`${o.key}_mode`]: flat ? 'pct' : 'flat' }, o.label.toLowerCase())
                          }
                          aria-label={flat ? `${o.label}: use a percentage` : `${o.label}: use a fixed amount`}
                          className="ml-2 rounded px-1 text-lp-text-tertiary hover:text-lp-text"
                          style={{ fontSize: 'var(--lp-text-xs)' }}
                        >
                          {flat ? 'use %' : 'fixed amount'}
                        </button>
                      ) : null}
                    </td>
                    <td className={pctCell}>
                      {flat ? (
                        <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-sm)' }}>fixed</span>
                      ) : (
                        <PctInput
                          label={o.label}
                          value={Number(settings[`${o.key}_pct`]) || 0}
                          disabled={readOnly}
                          onCommit={(f) => saveOverhead(o.key, f)}
                        />
                      )}
                    </td>
                    <td className={flat && !readOnly ? 'px-2' : num}>
                      {flat && !readOnly ? (
                        <MoneyInput
                          label={`${o.label} fixed amount`}
                          value={settings[`${o.key}_flat_amount`] != null ? Number(settings[`${o.key}_flat_amount`]) : null}
                          placeholder={money(0, ccy)}
                          onCommit={(v) => saveSettings({ [`${o.key}_flat_amount`]: v }, `${o.label.toLowerCase()} amount`)}
                        />
                      ) : (
                        money(pnl[o.key].projected, ccy)
                      )}
                    </td>
                    <td
                      className={readOnly ? num : 'px-2'}
                      title={
                        pnl.actualOverridden[o.key]
                          ? 'Typed actual (the real invoice). Clear it to use the calculation.'
                          : 'Calculated. Type the real invoice to replace it.'
                      }
                    >
                      {readOnly ? (
                        money(pnl[o.key].actual, ccy)
                      ) : (
                        <MoneyInput
                          label={`${o.label} actual`}
                          value={typedActual != null ? Number(typedActual) : null}
                          placeholder={money(pnl[o.key].actual, ccy)}
                          onCommit={(v) => saveSettings({ [`${o.key}_actual_amount`]: v }, `${o.label.toLowerCase()} actual`)}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
              {pnl.cogs.projected !== 0 || pnl.cogs.actual !== 0 ? (
                <tr className={tr}>
                  <td className={lbl}>Merch cost of goods</td>
                  <td />
                  <td className={num}>{money(pnl.cogs.projected, ccy)}</td>
                  <td className={num}>{money(pnl.cogs.actual, ccy)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
      ))}

      {/* ── Income, broken down (folded) ──────────────────── */}
      {fold('income', 'Income', incomeSummary, pnl.grossIncome, (
          <table className="w-full table-fixed border-collapse" style={cell}>
            <colgroup>
              <col />
              <col style={{ width: 136 }} />
              <col style={{ width: 136 }} />
            </colgroup>
            <thead>
              <tr>
                <th className={head}>Source</th>
                <th className={`${head} text-right`}>Proposed</th>
                <th className={`${head} text-right`}>Actual</th>
              </tr>
            </thead>
            <tbody>
              {incomeParts.map((r) => (
                <tr key={r.id} className={tr} data-testid={`sheet-income-${r.id}`} title={r.title}>
                  <td className={lbl}>
                    {r.label}
                    {r.id === 'other' && !hasIncomeSection && !readOnly ? (
                      <button
                        type="button"
                        onClick={() => void addOtherIncome()}
                        disabled={busy}
                        className="ml-2 inline-flex items-center gap-0.5 rounded px-1 text-lp-text-tertiary hover:text-lp-text disabled:opacity-50"
                        style={{ fontSize: 'var(--lp-text-xs)' }}
                      >
                        <Plus className="h-3 w-3" /> Add
                      </button>
                    ) : null}
                  </td>
                  <td className={num}>{money(r.v.projected, ccy)}</td>
                  <td className={num}>{money(r.v.actual, ccy)}</td>
                </tr>
              ))}
            </tbody>
          </table>
      ))}

      {/* ── Deposits: outside costs, shown only when there are any ── */}
      {depositRows.map((r) => (
        <div key={r.id} className="bs-plain" data-testid={`sheet-deposits-${r.id}`} title={r.title}>
          <span className="bs-fold-name">{r.label}</span>
          <span className="bs-fold-money">
            <span>{money(r.v.projected, ccy)}</span>
            <span className="bs-sub">{money(r.v.actual, ccy)} so far</span>
          </span>
        </div>
      ))}

      {pnl.fxMarginPct > 0 ? (
        <p className="bs-note">
          Projected foreign-currency amounts include a {+(pnl.fxMarginPct * 100).toFixed(2)}% bank margin
          (Tour settings). Actuals use the rate locked or paid on each line.
        </p>
      ) : null}
    </section>
  );
}
