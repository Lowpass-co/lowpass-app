/* ============================================
   LOWPASS — Budget PDF body (#8 Document Export, Budget slice)

   buildBudgetBodyHtml(data, config) → the per-surface BODY html the shared
   shell (shell.ts) wraps. The TemplateConfig (P1) drives section order/visibility
   + scope; DEFAULT config reproduces the original two-part output byte-for-byte:

     1. Summary P&L — straight from computeBudgetPnl (the SAME math the Summary tab
        runs), rendered with the scope's column set. Reconciles to the cent because
        it renders the engine's own PnlPair output (smoke EXP-BUD-01).
     2. Detail — income per show + expenses grouped by section, each foreign-currency
        row showing native AND tour-currency conversion (D5), section subtotals.

   scope = Projected | Actual | Both+Variance (default Both+Variance). Variance =
   actual − projected, per row + per total.

   Pure (no I/O). Currency conversion via the same helpers computeBudgetPnl uses
   (convertToCurrency for lines, toTourCurrency for income) so the detail sums
   reconcile with the summary.
   ============================================ */

import { computeBudgetPnl, type PnlPair } from '@/lib/budget/computeBudgetPnl';
import { convertToCurrency } from '@/lib/budget/fx';
import { toTourCurrency } from '@/lib/budget/fxRates';
import { getEffectiveActual } from '@/lib/budget/transactions';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { escapeHtml as esc } from '@/lib/export/shell';
import type { BudgetExportData, ExportIncomeRow } from '@/lib/export/budget-data';
import type { TemplateConfig } from '@/lib/export/template-config';

export type ExportScope = 'projected' | 'actual' | 'both';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function fmtMoney(value: number, ccy: string): string {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy.toUpperCase(), maximumFractionDigits: 0 }).format(Math.round(value));
  } catch {
    return `${ccy.toUpperCase()} ${Math.round(value).toLocaleString('en-GB')}`;
  }
}

/** Native + tour-currency conversion: "€1,000 (£850)" — or just the tour amount
 *  when the row is already in the tour currency (D5). */
function nativeAndConverted(native: number, rowCur: string, tourCur: string, converted: number): string {
  if (rowCur.toUpperCase() === tourCur.toUpperCase()) return fmtMoney(converted, tourCur);
  return `${esc(fmtMoney(native, rowCur))} <span class="lp-native">(${esc(fmtMoney(converted, tourCur))})</span>`;
}

const SCOPE_HEADERS: Record<ExportScope, string[]> = {
  projected: ['Projected'],
  actual: ['Actual'],
  both: ['Projected', 'Actual', 'Variance'],
};

/** The numeric `<td>`s for a projected/actual pair under the active scope.
 *  goodWhen = which direction of variance is "good" (income: higher; expense: lower). */
function pairCells(pair: PnlPair, scope: ExportScope, ccy: string, goodWhen: 'higher' | 'lower'): string {
  if (scope === 'projected') return `<td class="num">${esc(fmtMoney(pair.projected, ccy))}</td>`;
  if (scope === 'actual') return `<td class="num">${esc(fmtMoney(pair.actual, ccy))}</td>`;
  const delta = pair.actual - pair.projected;
  const good = goodWhen === 'higher' ? delta >= 0 : delta <= 0;
  const sign = delta > 0 ? '+' : '';
  return (
    `<td class="num">${esc(fmtMoney(pair.projected, ccy))}</td>` +
    `<td class="num">${esc(fmtMoney(pair.actual, ccy))}</td>` +
    `<td class="num ${good ? 'lp-pos' : 'lp-neg'}">${esc(sign + fmtMoney(delta, ccy))}</td>`
  );
}

function row(label: string, pair: PnlPair, scope: ExportScope, ccy: string, goodWhen: 'higher' | 'lower', cls = ''): string {
  return `<tr class="${cls}"><td>${esc(label)}</td>${pairCells(pair, scope, ccy, goodWhen)}</tr>`;
}

/** P1 template builder. `config.sections` (order + visibility) drives WHICH blocks
 *  render and in what order; `config.scope` picks the columns. The DEFAULT config
 *  (all sections shown, canonical order) reproduces the pre-template output
 *  byte-for-byte — verified. PRESENTATION ONLY: the numbers come from
 *  computeBudgetPnl regardless of config (reconciliation invariant). */
export function buildBudgetBodyHtml(data: BudgetExportData, config: TemplateConfig): string {
  const scope: ExportScope = (config.scope as ExportScope) ?? 'both';

  // Each section id → its self-contained HTML. Default order
  // [pnl-summary, income-detail, expense-detail] concatenates to today's output.
  const sections: Record<string, () => string> = {
    'pnl-summary': () => renderPnlSummary(data, scope),
    // The leading "\n    " + page-break preserve the original summary+detail
    // concatenation byte-for-byte when all three are shown in default order.
    'income-detail': () =>
      `\n    <div class="lp-page-break"></div>\n    <div class="lp-sec-head">Income detail (by show)</div>\n    ${buildIncomeDetail(data.income, scope, data.tour.currency, data.fxRates)}`,
    'expense-detail': () =>
      `\n    <div class="lp-sec-head">Expense detail (by section)</div>\n    ${buildExpenseDetail(data, scope, data.tour.currency)}`,
  };

  return config.sections
    .filter((s) => s.show)
    .map((s) => sections[s.id]?.() ?? '')
    .join('');
}

/** The P&L summary block (income breakdown → expenses by section + overheads →
 *  Net) — extracted from the original builder so it's a toggleable section. */
function renderPnlSummary(data: BudgetExportData, scope: ExportScope): string {
  const ccy = data.tour.currency;
  const fxRates = data.fxRates;

  const pnl = computeBudgetPnl({
    lines: data.lines,
    income: data.income,
    commissions: data.commissions,
    settings: data.settings,
    tourCurrency: ccy,
    fxRates,
  });

  const valHeads = SCOPE_HEADERS[scope].map((h) => `<th class="num">${esc(h)}</th>`).join('');

  /* ---------- Summary: income breakdown ---------- */
  const ib = pnl.incomeBreakdown;
  const incomeRows = [
    row('Guarantee', ib.guarantee, scope, ccy, 'higher'),
    row('Overage', ib.overage, scope, ccy, 'higher'),
    row('Merch', ib.merch, scope, ccy, 'higher'),
    row('VIP', ib.vip, scope, ccy, 'higher'),
    // Deductions are actual-only (reduce actual gross) — show when not projected-only.
    scope !== 'projected' ? row('Less: settlement deductions', ib.deductions, scope, ccy, 'lower') : '',
    row('Gross income', pnl.grossIncome, scope, ccy, 'higher', 'lp-subtotal'),
  ].join('');

  /* ---------- Summary: expenses by section + overheads ---------- */
  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]));
  const secAgg = new Map<string, { name: string; pair: PnlPair }>();
  for (const l of data.lines) {
    if (isIncomeRow(l)) continue;
    const rowCur = (l.currency || ccy).toUpperCase();
    const proj = convertToCurrency(num(l.proposed_cost), rowCur, ccy);
    const act = convertToCurrency(getEffectiveActual(l), rowCur, ccy);
    const key = l.section_id ?? '__none__';
    const cur = secAgg.get(key) ?? { name: (l.section_id && sectionName.get(l.section_id)) || l.section || 'Uncategorised', pair: { projected: 0, actual: 0 } };
    cur.pair.projected += proj;
    cur.pair.actual += act;
    secAgg.set(key, cur);
  }
  const sectionRows = [...secAgg.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => row(s.name, s.pair, scope, ccy, 'lower'))
    .join('');

  const overheadRows = [
    pnl.commissions.projected || pnl.commissions.actual ? row('Commissions', pnl.commissions, scope, ccy, 'lower') : '',
    pnl.insurance.projected || pnl.insurance.actual ? row(`Insurance (${Math.round(pnl.pct.insurance * 100)}%)`, pnl.insurance, scope, ccy, 'lower') : '',
    pnl.contingency.projected || pnl.contingency.actual ? row(`Contingency (${Math.round(pnl.pct.contingency * 100)}%)`, pnl.contingency, scope, ccy, 'lower') : '',
    pnl.accountancy.projected || pnl.accountancy.actual ? row(`Accountancy (${Math.round(pnl.pct.accountancy * 100)}%)`, pnl.accountancy, scope, ccy, 'lower') : '',
    pnl.cogs.projected || pnl.cogs.actual ? row(`Merch COGS (${Math.round(pnl.pct.merchCogs * 100)}%)`, pnl.cogs, scope, ccy, 'lower') : '',
    row('Total expenses', pnl.totalExpenses, scope, ccy, 'lower', 'lp-subtotal'),
  ].join('');

  /* ---------- NET ---------- */
  const netRow = row('NET', pnl.net, scope, ccy, 'higher', 'lp-subtotal');

  return `
    <div class="lp-sec-head">Profit &amp; Loss</div>
    <table class="lp-tbl">
      <thead><tr><th>Income</th>${valHeads}</tr></thead>
      <tbody>${incomeRows}</tbody>
    </table>
    <table class="lp-tbl">
      <thead><tr><th>Expenses</th>${valHeads}</tr></thead>
      <tbody>${sectionRows}${overheadRows}</tbody>
    </table>
    <table class="lp-tbl">
      <tbody>${netRow}</tbody>
    </table>`;
}

/** Per-show income: projected (post-tax gross) vs actual (gross − deductions),
 *  native+converted, reconciling to grossIncome. */
function buildIncomeDetail(income: ExportIncomeRow[], scope: ExportScope, ccy: string, fxRates: Record<string, number>): string {
  if (income.length === 0) return `<p class="lp-native">No show income recorded.</p>`;
  const valHeads = SCOPE_HEADERS[scope].map((h) => `<th class="num">${esc(h)}</th>`).join('');
  let totProj = 0;
  let totAct = 0;
  const rows = income
    .filter((i) => {
      // Only rows that carry some income (skip empty routing-only shells).
      return num(i.pre_tax_guarantee) || num(i.pre_tax_overage) || num(i.merch_income) || num(i.vip_income) ||
        num(i.actual_guarantee) || num(i.actual_overage) || num(i.actual_merch) || num(i.actual_vip);
    })
    .map((i) => {
      const rowCur = (i.currency || ccy).toUpperCase();
      const f = (n: number) => toTourCurrency(n, i.currency ?? null, ccy, fxRates);
      const wh = num(i.withholding_pct) / 100;
      const projNative =
        (i.post_tax_guarantee != null ? num(i.post_tax_guarantee) : num(i.pre_tax_guarantee) * (1 - wh)) +
        (i.post_tax_overage != null ? num(i.post_tax_overage) : num(i.pre_tax_overage) * (1 - wh)) +
        num(i.merch_income) + num(i.vip_income);
      const actNative = num(i.actual_guarantee) + num(i.actual_overage) + num(i.actual_merch) + num(i.actual_vip) - num(i.actual_deductions);
      const projConv = f(projNative);
      const actConv = f(actNative);
      totProj += projConv;
      totAct += actConv;
      const when = (i.date ?? '').slice(0, 10);
      const venue = i.venue_name || i.city || '—';
      const valCells =
        scope === 'projected' ? `<td class="num">${nativeAndConverted(projNative, rowCur, ccy, projConv)}</td>`
          : scope === 'actual' ? `<td class="num">${nativeAndConverted(actNative, rowCur, ccy, actConv)}</td>`
            : `<td class="num">${nativeAndConverted(projNative, rowCur, ccy, projConv)}</td><td class="num">${nativeAndConverted(actNative, rowCur, ccy, actConv)}</td><td class="num ${actConv - projConv >= 0 ? 'lp-pos' : 'lp-neg'}">${esc((actConv - projConv > 0 ? '+' : '') + fmtMoney(actConv - projConv, ccy))}</td>`;
      return `<tr><td>${esc(when)}</td><td>${esc(venue)}</td>${valCells}</tr>`;
    })
    .join('');
  const totalPair: PnlPair = { projected: totProj, actual: totAct };
  const totCells = pairCells(totalPair, scope, ccy, 'higher');
  return `<table class="lp-tbl">
    <thead><tr><th>Date</th><th>Venue</th>${valHeads}</tr></thead>
    <tbody>${rows}<tr class="lp-subtotal"><td colspan="2">Total income</td>${totCells}</tbody>
  </table>`;
}

/** Per-section expense lines (native+converted), with section subtotals. */
function buildExpenseDetail(data: BudgetExportData, scope: ExportScope, ccy: string): string {
  const valHeads = SCOPE_HEADERS[scope].map((h) => `<th class="num">${esc(h)}</th>`).join('');
  const sectionName = new Map(data.sections.map((s) => [s.id, s.name]));
  const bySection = new Map<string, { name: string; lines: typeof data.lines }>();
  for (const l of data.lines) {
    if (isIncomeRow(l)) continue;
    const key = l.section_id ?? '__none__';
    const entry = bySection.get(key) ?? { name: (l.section_id && sectionName.get(l.section_id)) || l.section || 'Uncategorised', lines: [] as typeof data.lines };
    entry.lines.push(l);
    bySection.set(key, entry);
  }
  if (bySection.size === 0) return `<p class="lp-native">No expense lines recorded.</p>`;
  const groups = [...bySection.values()].sort((a, b) => a.name.localeCompare(b.name));
  return groups
    .map((g) => {
      let secProj = 0;
      let secAct = 0;
      const lineRows = g.lines
        .map((l) => {
          const rowCur = (l.currency || ccy).toUpperCase();
          const projN = num(l.proposed_cost);
          const actN = getEffectiveActual(l);
          const projC = convertToCurrency(projN, rowCur, ccy);
          const actC = convertToCurrency(actN, rowCur, ccy);
          secProj += projC;
          secAct += actC;
          const cells =
            scope === 'projected' ? `<td class="num">${nativeAndConverted(projN, rowCur, ccy, projC)}</td>`
              : scope === 'actual' ? `<td class="num">${nativeAndConverted(actN, rowCur, ccy, actC)}</td>`
                : `<td class="num">${nativeAndConverted(projN, rowCur, ccy, projC)}</td><td class="num">${nativeAndConverted(actN, rowCur, ccy, actC)}</td><td class="num ${actC - projC <= 0 ? 'lp-pos' : 'lp-neg'}">${esc((actC - projC > 0 ? '+' : '') + fmtMoney(actC - projC, ccy))}</td>`;
          return `<tr><td>${esc(l.label || '—')}</td>${cells}</tr>`;
        })
        .join('');
      const subCells = pairCells({ projected: secProj, actual: secAct }, scope, ccy, 'lower');
      return `<div class="lp-sec-head" style="font-size:11px;">${esc(g.name)}</div>
        <table class="lp-tbl">
          <thead><tr><th>Item</th>${valHeads}</tr></thead>
          <tbody>${lineRows}<tr class="lp-subtotal"><td>Section total</td>${subCells}</tbody>
        </table>`;
    })
    .join('');
}
