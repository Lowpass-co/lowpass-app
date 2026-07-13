'use client';

/* ============================================
   LOWPASS — Budget Summary cards (approved design)

   The eight typed bricks. Each reads computeBudgetPnl (or the presentation-only
   derivations in summaryData) — NEVER recomputes. Token-clean; `.lp-mono` for
   numerics only, labels stay sentence/caps. See the field map in the dashboard doc.
   ============================================ */

import { GripVertical, Eye } from 'lucide-react';
import type { BudgetPnl } from '@/lib/budget/computeBudgetPnl';
import type { SectionExpense, BurnFigures, ShowIncome } from './summaryData';

/* ---- shared helpers ---- */

function symbolFor(currency: string): string {
  try {
    return (0).toLocaleString('en-GB', { style: 'currency', currency: currency.toUpperCase(), minimumFractionDigits: 0 }).replace(/[\d.,\s-]/g, '');
  } catch {
    return `${currency.toUpperCase()} `;
  }
}
function money(v: number, ccy: string): string {
  const sym = symbolFor(ccy);
  const sign = v < 0 ? '−' : '';
  return `${sign}${sym}${Math.round(Math.abs(v)).toLocaleString('en-GB')}`;
}
function moneyAbbrev(v: number, ccy: string): string {
  const sym = symbolFor(ccy);
  const sign = v < 0 ? '−' : '';
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${sign}${sym}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${sym}${Math.round(abs / 1_000)}K`;
  return `${sign}${sym}${Math.round(abs).toLocaleString('en-GB')}`;
}
const clampPct = (n: number) => Math.max(0, Math.min(100, n));

/** The card shell: surface bg, hairline border, radius, the micro-label header + the
 *  grip/eye affordance (shown in edit mode). Sits ON the page — no heavy container. */
export function SummaryCard({
  label,
  editMode,
  onHide,
  dragHandleProps,
  children,
}: {
  label: string;
  editMode: boolean;
  onHide?: () => void;
  dragHandleProps?: React.HTMLAttributes<HTMLSpanElement>;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border)',
        borderRadius: 'var(--lp-radius-lg)',
        padding: '12px 13px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
          {label}
        </span>
        {editMode ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span {...dragHandleProps} aria-label="Drag to reorder" style={{ cursor: 'grab', color: 'var(--lp-text-tertiary)', display: 'inline-flex' }}>
              <GripVertical className="h-3.5 w-3.5" aria-hidden />
            </span>
            <button type="button" onClick={onHide} aria-label={`Hide ${label}`} className="btn-transition" style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--lp-orange)', padding: 0, display: 'inline-flex' }}>
              <Eye className="h-3.5 w-3.5" aria-hidden />
            </button>
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

const posNeg = (v: number) => (v >= 0 ? 'var(--color-lp-status-complete)' : 'var(--color-lp-error)');

/* ---- 1. net-pnl (hero) ---- */
export function NetPnlCard({ pnl }: { pnl: BudgetPnl }) {
  const ccy = pnl.currency;
  const net = pnl.net.actual;
  const delta = pnl.net.actual - pnl.net.projected;
  const overheads = pnl.commissions.actual + pnl.insurance.actual + pnl.contingency.actual + pnl.accountancy.actual + pnl.cogs.actual;
  const income = Math.max(0, pnl.grossIncome.actual);
  const incomeProjected = Math.max(0, pnl.grossIncome.projected);
  const base = Math.max(0, pnl.baseExpenses.actual);
  const oh = Math.max(0, overheads);

  // §C5 planning-state neutrality — the wince. When NO income is booked or
  // projected, a red "−£net" headline + a slammed orange bar reads as a loss;
  // it's really a plan with costs entered before income. Render NEUTRAL: the
  // committed spend as a plain figure, a muted grey bar (no green/orange slam),
  // and an invitation to add income. No red, no 0%-margin denominator.
  const hasIncome = income > 0 || incomeProjected > 0;

  if (!hasIncome) {
    const committed = base + oh;
    const barTotal = committed || 1;
    const neutralA = 'color-mix(in srgb, var(--lp-text) 26%, transparent)';
    const neutralB = 'color-mix(in srgb, var(--lp-text) 14%, transparent)';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <span className="lp-mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, color: 'var(--lp-text)' }}>{money(committed, ccy)}</span>
          <span style={{ fontSize: 13, color: 'var(--lp-text-tertiary)' }}>committed · planning</span>
        </div>
        <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'color-mix(in srgb, var(--lp-text) 6%, transparent)' }}>
          <div title={`Expenses ${money(base, ccy)}`} style={{ width: `${(base / barTotal) * 100}%`, background: neutralA }} />
          <div title={`Overheads ${money(oh, ccy)}`} style={{ width: `${(oh / barTotal) * 100}%`, background: neutralB }} />
        </div>
        <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          Add income to project your margin — expenses so far{' '}
          <b className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(base, ccy)}</b>
          {oh > 0 ? <> · overheads <b className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(oh, ccy)}</b></> : null}
        </div>
      </div>
    );
  }

  const marginPct = income > 0 ? (net / income) * 100 : null;
  const barTotal = income + base + oh || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="lp-mono" style={{ fontSize: 30, fontWeight: 600, lineHeight: 1, color: posNeg(net) }}>{money(net, ccy)}</span>
        <span style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}>{marginPct == null ? 'margin pending income' : `${Math.round(marginPct)}% margin`}</span>
        <span className="lp-mono" style={{ fontSize: 12, color: posNeg(delta) }}>{delta >= 0 ? '+' : ''}{moneyAbbrev(delta, ccy)} vs projected</span>
      </div>
      <div style={{ display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', background: 'color-mix(in srgb, var(--lp-text) 6%, transparent)' }}>
        <div title={`Income ${money(income, ccy)}`} style={{ width: `${(income / barTotal) * 100}%`, background: 'color-mix(in srgb, var(--color-lp-status-complete) 70%, transparent)' }} />
        <div title={`Expenses ${money(base, ccy)}`} style={{ width: `${(base / barTotal) * 100}%`, background: 'color-mix(in srgb, var(--lp-orange) 70%, transparent)' }} />
        <div title={`Overheads ${money(oh, ccy)}`} style={{ width: `${(oh / barTotal) * 100}%`, background: 'color-mix(in srgb, var(--color-lp-info) 60%, transparent)' }} />
      </div>
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--lp-text-tertiary)', flexWrap: 'wrap' }}>
        <span><Dot c="var(--color-lp-status-complete)" /> Income <b className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(income, ccy)}</b></span>
        <span><Dot c="var(--lp-orange)" /> Expenses <b className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(base, ccy)}</b></span>
        <span><Dot c="var(--color-lp-info)" /> Overheads <b className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(oh, ccy)}</b></span>
      </div>
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return <span aria-hidden style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: c, marginRight: 4 }} />;
}

/* ---- 2. expenses-by-section ---- */
export function ExpensesBySectionCard({ rows, currency }: { rows: SectionExpense[]; currency: string }) {
  const max = rows.reduce((m, r) => Math.max(m, Math.abs(r.actual)), 0) || 1;
  if (rows.length === 0) return <Empty>No expenses yet — add a line to see the breakdown.</Empty>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map((r) => (
        <li key={r.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(90px,140px) 1fr auto', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--lp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
          <span style={{ height: 6, borderRadius: 999, background: 'color-mix(in srgb, var(--lp-text) 6%, transparent)' }}>
            {/* §C5/D-preflight #4 — NEUTRAL magnitude fill. Orange/red is reserved
                for a real over-budget signal; a section bar just shows relative
                size, so it must not read as alarm. */}
            <span style={{ display: 'block', height: '100%', width: `${clampPct((Math.abs(r.actual) / max) * 100)}%`, borderRadius: 999, background: 'color-mix(in srgb, var(--lp-text) 28%, transparent)' }} />
          </span>
          <span className="lp-mono" style={{ fontSize: 12, color: 'var(--lp-text-secondary)', textAlign: 'right' }}>{money(r.actual, currency)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---- 3. per-show-pnl (income) ---- */
export function PerShowPnlCard({ rows, currency }: { rows: ShowIncome[]; currency: string }) {
  if (rows.length === 0) return <Empty>No show income yet — add a guarantee or deal to project P&amp;L.</Empty>;
  const total = rows.reduce((a, r) => a + r.income, 0);
  const avg = rows.length ? total / rows.length : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {rows.map((r) => (
          <li key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '4px 0', borderBottom: '1px solid var(--lp-border-subtle)', fontSize: 12 }}>
            <span style={{ color: 'var(--lp-text)' }}>{r.label}</span>
            <span className="lp-mono" style={{ color: posNeg(r.income) }}>{money(r.income, currency)}</span>
          </li>
        ))}
      </ul>
      <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>{rows.length} show{rows.length === 1 ? '' : 's'} · avg <span className="lp-mono">{moneyAbbrev(avg, currency)}</span></div>
    </div>
  );
}

/* ---- 4. committed-burn ---- */
export function CommittedBurnCard({ burn, currency }: { burn: BurnFigures; currency: string }) {
  // §C5 sensible denominator — with no budget total, "% used" divides by zero and
  // slams to 100%. Show the committed figure + an invitation instead.
  if (!(burn.total > 0)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span className="lp-mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--lp-text)' }}>{money(burn.committed || burn.spent, currency)}</span>
        <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>committed so far · set a budget in Settings to track burn</span>
      </div>
    );
  }
  const pct = clampPct(burn.pctUsed);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="lp-mono" style={{ fontSize: 20, fontWeight: 600, color: 'var(--lp-text)' }}>{money(burn.spent, currency)}</span>
        <span style={{ fontSize: 12, color: 'var(--lp-text-secondary)' }}>of {money(burn.total, currency)} · {Math.round(burn.pctUsed)}%</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: 'color-mix(in srgb, var(--lp-text) 6%, transparent)' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 999, background: 'var(--color-lp-status-complete)', transition: 'width var(--lp-duration-slow) var(--lp-ease-standard)' }} />
      </div>
      <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>committed <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)' }}>{moneyAbbrev(burn.committed, currency)}</span> · remaining <span className="lp-mono" style={{ color: burn.remaining >= 0 ? 'var(--lp-text-secondary)' : 'var(--color-lp-error)' }}>{moneyAbbrev(burn.remaining, currency)}</span></div>
    </div>
  );
}

/* ---- 5. overheads-commissions ---- */
export function OverheadsCommissionsCard({ pnl }: { pnl: BudgetPnl }) {
  const ccy = pnl.currency;
  const rows: Array<{ label: string; basePct: number | null; amount: number }> = [
    { label: 'Insurance', basePct: pnl.pct.insurance, amount: pnl.insurance.actual },
    { label: 'Accountancy', basePct: pnl.pct.accountancy, amount: pnl.accountancy.actual },
    { label: 'Contingency', basePct: pnl.pct.contingency, amount: pnl.contingency.actual },
    { label: 'Merch COGS', basePct: pnl.pct.merchCogs, amount: pnl.cogs.actual },
    ...pnl.commissionRows.map((c) => ({ label: c.label, basePct: c.pct, amount: c.actual })),
  ].filter((r) => r.amount !== 0 || (r.basePct ?? 0) !== 0);
  if (rows.length === 0) return <Empty>No overheads or commissions — set rates in Settings.</Empty>;
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => (
        <li key={r.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--lp-border-subtle)', fontSize: 12 }}>
          <span style={{ color: 'var(--lp-text)' }}>{r.label}</span>
          {/* VIS-BG-03 — computed section: ƒ chip + the formula text (the % of
              the P&L base). Orange italic ƒ marks it as engine-computed +
              uneditable (this whole card is display-only). */}
          <span
            className="lp-mono"
            style={{ color: 'var(--lp-text-tertiary)' }}
            title={r.basePct != null ? 'Computed — percentage of the P&L base (edit in Settings)' : undefined}
          >
            {r.basePct != null ? (
              <>
                <span aria-hidden style={{ color: 'var(--lp-orange)', fontStyle: 'italic', fontWeight: 700, marginRight: 3 }}>ƒ</span>
                {`${Math.round(r.basePct * 100)}%`}
              </>
            ) : (
              '—'
            )}
          </span>
          <span className="lp-mono" style={{ color: 'var(--lp-text-secondary)', textAlign: 'right', minWidth: 70 }}>{money(r.amount, ccy)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ---- 6/7. single-figure cards ---- */
export function FigureCard({ actual, projected, currency }: { actual: number; projected: number; currency: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="lp-mono" style={{ fontSize: 22, fontWeight: 600, color: 'var(--lp-text)' }}>{money(actual, currency)}</span>
      <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>projected <span className="lp-mono">{money(projected, currency)}</span></span>
    </div>
  );
}

/* ---- 8. variance ---- */
export function VarianceCard({ pnl }: { pnl: BudgetPnl }) {
  const ccy = pnl.currency;
  const rows: Array<{ label: string; proj: number; act: number }> = [
    { label: 'Gross income', proj: pnl.grossIncome.projected, act: pnl.grossIncome.actual },
    { label: 'Total expenses', proj: pnl.totalExpenses.projected, act: pnl.totalExpenses.actual },
    { label: 'Net', proj: pnl.net.projected, act: pnl.net.actual },
  ];
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
      {rows.map((r) => {
        const d = r.act - r.proj;
        return (
          <li key={r.label} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'baseline', padding: '4px 0', borderBottom: '1px solid var(--lp-border-subtle)', fontSize: 12 }}>
            <span style={{ color: 'var(--lp-text)' }}>{r.label}</span>
            <span className="lp-mono" style={{ color: posNeg(r.label === 'Total expenses' ? -d : d) }}>{d >= 0 ? '+' : ''}{money(d, ccy)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ margin: 0, fontSize: 12, color: 'var(--lp-text-tertiary)' }}>{children}</p>;
}
