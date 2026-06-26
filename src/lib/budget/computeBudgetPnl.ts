/* ============================================
   LOWPASS — Budget P&L rollup (Stage 3, single source of truth)

   A PURE function (no I/O) so the SAME math runs server-side AND
   client-side over the optimistic line overlay — edits recompute the
   waterfall live with NO per-edit refresh (pitfall #1).

   Waterfall (manager-PDF order), Projected vs Actual:

     Gross income   = Σ post-tax guarantee + post-tax overage + merch + VIP
     Merch net      = merch − merch × merch_cogs_pct
     Base expenses  = Σ line-item actuals (excl. income rows; incl. the
                      derived rooming/payroll lines from Stage 2 linking)
     Commissions    = Σ (pct × base), base chosen per row `basis`
     Insurance      = insurance_pct × base expenses
     Contingency    = contingency_pct × base expenses
     Accountancy    = accountancy_pct × gross income
     COGS           = merch_cogs_pct × merch
     Total expenses = base + commissions + insurance + contingency
                      + accountancy + cogs
     NET (loss)     = gross income − total expenses

   Validated against Adam's GN SUMMARY (income 43,600; agency 10% of
   gross; insurance 3% + contingency 2% of the expense base; total ≈
   48,666) — see the tests in the PR notes.

   `category` is NOT used here; income rows are detected via isIncomeRow
   (section === 'income'). Reuses normalizeCommissionPct + getEffectiveActual.
   ============================================ */

import { normalizeCommissionPct } from '@/lib/commission-pct';
import { getEffectiveActual } from '@/lib/budget/transactions';
import { convertToCurrency } from '@/lib/budget/fx';
import { toTourCurrency, type FxRateMap } from '@/lib/budget/fxRates';
import { isIncomeRow } from '@/lib/budget/income-rows';
import type { BudgetLineItem } from '@/types';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface PnlPair {
  projected: number;
  actual: number;
}

export interface PnlCommissionRow {
  id: string;
  label: string;
  basis: string;
  /** Normalised fraction (0.10 = 10%). */
  pct: number;
  projected: number;
  actual: number;
}

export interface BudgetIncomeBreakdown {
  guarantee: PnlPair;
  overage: PnlPair;
  merch: PnlPair;
  vip: PnlPair;
  /** Phase 1 — settlement-fed deductions (actual-only). */
  deductions: PnlPair;
}

export interface BudgetPnl {
  currency: string;
  grossIncome: PnlPair;
  /** Phase 4 — post-tax income components of grossIncome (read-only breakdown). */
  incomeBreakdown: BudgetIncomeBreakdown;
  merch: PnlPair;
  merchNet: PnlPair;
  /** Σ line-item actuals, excl. income rows. */
  baseExpenses: PnlPair;
  commissions: PnlPair;
  insurance: PnlPair;
  contingency: PnlPair;
  accountancy: PnlPair;
  cogs: PnlPair;
  totalExpenses: PnlPair;
  net: PnlPair;
  commissionRows: PnlCommissionRow[];
  pct: {
    insurance: number;
    contingency: number;
    accountancy: number;
    merchCogs: number;
  };
  basis: {
    insurance: OverheadBasis;
    contingency: OverheadBasis;
    accountancy: OverheadBasis;
  };
}

export interface IncomeInput {
  pre_tax_guarantee?: number | null;
  post_tax_guarantee?: number | null;
  pre_tax_overage?: number | null;
  post_tax_overage?: number | null;
  withholding_pct?: number | null;
  merch_income?: number | null;
  vip_income?: number | null;
  actual_guarantee?: number | null;
  actual_overage?: number | null;
  actual_merch?: number | null;
  actual_vip?: number | null;
  /** Settlement-fed deductions (Phase 1) — subtracted from ACTUAL income so NET
   *  reflects real receipts. Actual-only (unversioned). */
  actual_deductions?: number | null;
  /** Phase 2 — the show's native currency (NULL = tour currency). */
  currency?: string | null;
}

export interface CommissionInput {
  id: string;
  label: string;
  percentage?: number | null;
  basis?: string | null;
}

/** Phase 1 — which base an overhead % multiplies. */
export type OverheadBasis =
  | 'income_gross'
  | 'expenses_total'
  | 'expenses_pre_contingency';

export interface PnlSettingsInput {
  insurance_pct?: number | null;
  contingency_pct?: number | null;
  accountancy_pct?: number | null;
  merch_cogs_pct?: number | null;
  insurance_basis?: string | null;
  contingency_basis?: string | null;
  accountancy_basis?: string | null;
}

export function computeBudgetPnl(input: {
  lines: BudgetLineItem[];
  income: IncomeInput[];
  commissions: CommissionInput[];
  settings: PnlSettingsInput | null;
  tourCurrency: string;
  /** Phase 2 — per-tour FX map (1 <currency> = rate <tour ccy>); converts each
   *  show's native income into the tour currency before totalling. */
  fxRates?: FxRateMap;
}): BudgetPnl {
  const { lines, income, commissions, settings } = input;
  const currency = (input.tourCurrency || 'GBP').toUpperCase();
  const fxRates = input.fxRates ?? {};

  // Base expenses — every non-income line, in tour currency.
  let baseProjected = 0;
  let baseActual = 0;
  for (const l of lines) {
    if (isIncomeRow(l)) continue;
    const lcur = (l.currency || currency).toUpperCase();
    baseProjected += convertToCurrency(num(l.proposed_cost), lcur, currency);
    baseActual += convertToCurrency(getEffectiveActual(l), lcur, currency);
  }

  // Gross income (post-tax) + merch + pre-tax bases for commissions.
  const postTaxGuar = (i: IncomeInput) =>
    i.post_tax_guarantee != null
      ? num(i.post_tax_guarantee)
      : num(i.pre_tax_guarantee) * (1 - num(i.withholding_pct) / 100);
  const postTaxOver = (i: IncomeInput) =>
    i.post_tax_overage != null
      ? num(i.post_tax_overage)
      : num(i.pre_tax_overage) * (1 - num(i.withholding_pct) / 100);

  let grossProj = 0;
  let grossAct = 0;
  let merchProj = 0;
  let merchAct = 0;
  let preTaxProj = 0;
  let preTaxAct = 0;
  // Phase 4 — read-only income breakdown accumulators (presentation only; these
  // are the SAME post-tax components already summed into grossProj/grossAct — no
  // new math). guarProj + overProj + merchProj + vipProj === grossProj;
  // guarAct + overAct + merchAct + vipAct − dedAct === grossAct.
  let guarProj = 0;
  let guarAct = 0;
  let overProj = 0;
  let overAct = 0;
  let vipProj = 0;
  let vipAct = 0;
  let dedAct = 0;
  for (const i of income) {
    // Phase 2 — convert this show's native income → tour currency. f is the
    // row's rate (1 for the tour currency / a currency with no rate).
    const f = toTourCurrency(1, i.currency, currency, fxRates);
    merchProj += num(i.merch_income) * f;
    merchAct += num(i.actual_merch) * f;
    guarProj += postTaxGuar(i) * f;
    guarAct += num(i.actual_guarantee) * f;
    overProj += postTaxOver(i) * f;
    overAct += num(i.actual_overage) * f;
    vipProj += num(i.vip_income) * f;
    vipAct += num(i.actual_vip) * f;
    dedAct += num(i.actual_deductions) * f;
    grossProj += (postTaxGuar(i) + postTaxOver(i) + num(i.merch_income) + num(i.vip_income)) * f;
    grossAct +=
      (num(i.actual_guarantee) +
        num(i.actual_overage) +
        num(i.actual_merch) +
        num(i.actual_vip) -
        num(i.actual_deductions)) * f;
    preTaxProj +=
      (num(i.pre_tax_guarantee ?? i.post_tax_guarantee) +
        num(i.pre_tax_overage) +
        num(i.merch_income) +
        num(i.vip_income)) * f;
    preTaxAct +=
      (num(i.actual_guarantee) +
        num(i.actual_overage) +
        num(i.actual_merch) +
        num(i.actual_vip) -
        num(i.actual_deductions)) * f;
  }

  const insurancePct = num(settings?.insurance_pct);
  const contingencyPct = num(settings?.contingency_pct);
  const accountancyPct = num(settings?.accountancy_pct);
  const merchCogsPct = num(settings?.merch_cogs_pct);
  const insuranceBasis = (settings?.insurance_basis ?? 'income_gross') as OverheadBasis;
  const contingencyBasis = (settings?.contingency_basis ??
    'expenses_pre_contingency') as OverheadBasis;
  const accountancyBasis = (settings?.accountancy_basis ?? 'income_gross') as OverheadBasis;

  /* Phase 1 — resolve an overhead's configured base. The evaluation
     order is fixed (cogs → insurance → commissions → contingency →
     accountancy), so each base only references already-computed values
     (not-yet-computed ones are 0 in ctx) — no circularity. */
  const expenseBase = (
    basis: OverheadBasis,
    ctx: {
      gross: number;
      lineItems: number;
      commissions: number;
      insurance: number;
      contingency: number;
    },
  ): number => {
    switch (basis) {
      case 'expenses_total':
        return ctx.lineItems + ctx.commissions + ctx.insurance + ctx.contingency;
      case 'expenses_pre_contingency':
        return ctx.lineItems + ctx.commissions + ctx.insurance;
      case 'income_gross':
      default:
        return ctx.gross;
    }
  };

  // COGS — merch only.
  const cogsProj = merchCogsPct * merchProj;
  const cogsAct = merchCogsPct * merchAct;

  // Insurance — commissions + contingency not yet known (0 in ctx).
  const insuranceProj =
    insurancePct *
    expenseBase(insuranceBasis, {
      gross: grossProj,
      lineItems: baseProjected,
      commissions: 0,
      insurance: 0,
      contingency: 0,
    });
  const insuranceAct =
    insurancePct *
    expenseBase(insuranceBasis, {
      gross: grossAct,
      lineItems: baseActual,
      commissions: 0,
      insurance: 0,
      contingency: 0,
    });

  // Commissions — `net` basis = gross − expenses before commission
  // (line items + insurance + cogs; contingency/accountancy come after).
  const ebcProj = baseProjected + insuranceProj + cogsProj;
  const ebcAct = baseActual + insuranceAct + cogsAct;
  const basisValue = (basis: string, projected: boolean): number => {
    const gross = projected ? grossProj : grossAct;
    const ebc = projected ? ebcProj : ebcAct;
    const merch = projected ? merchProj : merchAct;
    const preTax = projected ? preTaxProj : preTaxAct;
    const cogs = projected ? cogsProj : cogsAct;
    switch (basis) {
      case 'net':
        return Math.max(0, gross - ebc);
      case 'gross_merch':
        return merch;
      case 'net_merch':
        return Math.max(0, merch - cogs);
      case 'gross_minus_tax':
        return preTax;
      case 'gross':
      default:
        return gross;
    }
  };

  const commissionRows: PnlCommissionRow[] = commissions.map((c) => {
    const pct = normalizeCommissionPct(c.percentage);
    const basis = c.basis ?? 'gross';
    return {
      id: c.id,
      label: c.label,
      basis,
      pct,
      projected: pct * basisValue(basis, true),
      actual: pct * basisValue(basis, false),
    };
  });
  const commProj = commissionRows.reduce((a, r) => a + r.projected, 0);
  const commAct = commissionRows.reduce((a, r) => a + r.actual, 0);

  // Contingency — now commissions + insurance are known.
  const contingencyProj =
    contingencyPct *
    expenseBase(contingencyBasis, {
      gross: grossProj,
      lineItems: baseProjected,
      commissions: commProj,
      insurance: insuranceProj,
      contingency: 0,
    });
  const contingencyAct =
    contingencyPct *
    expenseBase(contingencyBasis, {
      gross: grossAct,
      lineItems: baseActual,
      commissions: commAct,
      insurance: insuranceAct,
      contingency: 0,
    });

  // Accountancy — everything except itself is known.
  const accountancyProj =
    accountancyPct *
    expenseBase(accountancyBasis, {
      gross: grossProj,
      lineItems: baseProjected,
      commissions: commProj,
      insurance: insuranceProj,
      contingency: contingencyProj,
    });
  const accountancyAct =
    accountancyPct *
    expenseBase(accountancyBasis, {
      gross: grossAct,
      lineItems: baseActual,
      commissions: commAct,
      insurance: insuranceAct,
      contingency: contingencyAct,
    });

  const totalProj =
    baseProjected + commProj + insuranceProj + contingencyProj + accountancyProj + cogsProj;
  const totalAct =
    baseActual + commAct + insuranceAct + contingencyAct + accountancyAct + cogsAct;

  return {
    currency,
    grossIncome: { projected: grossProj, actual: grossAct },
    // Phase 4 — read-only income breakdown (post-tax components of grossIncome,
    // mirroring the reference sheet's PROJECTED/ACTUAL income rows). Deductions are
    // actual-only (Phase 1) and subtract from the actual gross.
    incomeBreakdown: {
      guarantee: { projected: guarProj, actual: guarAct },
      overage: { projected: overProj, actual: overAct },
      merch: { projected: merchProj, actual: merchAct },
      vip: { projected: vipProj, actual: vipAct },
      deductions: { projected: 0, actual: dedAct },
    },
    merch: { projected: merchProj, actual: merchAct },
    merchNet: { projected: merchProj - cogsProj, actual: merchAct - cogsAct },
    baseExpenses: { projected: baseProjected, actual: baseActual },
    commissions: { projected: commProj, actual: commAct },
    insurance: { projected: insuranceProj, actual: insuranceAct },
    contingency: { projected: contingencyProj, actual: contingencyAct },
    accountancy: { projected: accountancyProj, actual: accountancyAct },
    cogs: { projected: cogsProj, actual: cogsAct },
    totalExpenses: { projected: totalProj, actual: totalAct },
    net: { projected: grossProj - totalProj, actual: grossAct - totalAct },
    commissionRows,
    pct: {
      insurance: insurancePct,
      contingency: contingencyPct,
      accountancy: accountancyPct,
      merchCogs: merchCogsPct,
    },
    basis: {
      insurance: insuranceBasis,
      contingency: contingencyBasis,
      accountancy: accountancyBasis,
    },
  };
}
