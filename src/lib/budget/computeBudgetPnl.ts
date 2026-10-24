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

   Migration 274 (USA '26 reconciliation against the business manager):
     • Other income — lines in an 'income' section (buy-on, sponsorship) now
       ADD to gross income. Before, they were dropped from expenses and never
       added anywhere, so the money vanished.
     • Commission components — a commission can be a % of any mix of show
       income (pre- or post-tax), merch (net of COGS), VIP and commissionable
       other income. NULL components = the legacy single `basis`.
     • Overheads — each of insurance / contingency / accountancy is a % of a
       base OR a flat amount, and its ACTUAL can be overridden with the real
       invoice. New base 'income_show' = show income before tax.
     • Bank margin — fx_margin_pct worsens every PROJECTED foreign amount
       (income × (1 − m), cost × (1 + m)). Actuals are untouched.
     • Refundable deposits — pending/returned deposits stay out of costs and
       are reported as money owed back.
   ============================================ */

import { normalizeCommissionPct } from '@/lib/commission-pct';
import { toTourCurrency, type FxRateMap } from '@/lib/budget/fxRates';
import { isIncomeRow } from '@/lib/budget/income-rows';
import { fxMargin, isHeldDeposit, lineInTour, refundableStatus } from '@/lib/budget/lineMoney';
import type { BudgetLineItem, CommissionComponent } from '@/types';

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
  /** Migration 274 — ticked parts of income (null = the legacy basis). */
  components: CommissionComponent[] | null;
  /** Migration 274 — show income measured before withholding. */
  preTax: boolean;
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
  /** Migration 274 — Other income lines (buy-on, sponsorship…). */
  other: PnlPair;
  /** Phase 1 — settlement-fed deductions (actual-only). */
  deductions: PnlPair;
}

export type OverheadMode = 'pct' | 'flat';

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
  /** Migration 274 — show income (guarantees + overages), before and after tax. */
  showIncome: { preTax: PnlPair; postTax: PnlPair };
  /** Migration 274 — refundable deposits kept out of costs. */
  deposits: { owedBack: PnlPair; returned: PnlPair };
  /** Migration 274 — bank margin applied to projected foreign amounts. */
  fxMarginPct: number;
  mode: {
    insurance: OverheadMode;
    contingency: OverheadMode;
    accountancy: OverheadMode;
  };
  /** Migration 274 — true where the ACTUAL is a typed invoice figure. */
  actualOverridden: {
    insurance: boolean;
    contingency: boolean;
    accountancy: boolean;
  };
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
  /** Live FX (#currency 2.5) — the rate LOCKED at settlement (1 show ccy = rate
   *  tour ccy). NULL = still projected → the P&L uses the live rate. Settled rows
   *  use this frozen rate so realised income never drifts. Missing/≤0 → 1:1. */
  locked_fx_rate?: number | null;
}

export interface CommissionInput {
  id: string;
  label: string;
  percentage?: number | null;
  basis?: string | null;
  /** Migration 274 — ticked parts of income; null/empty = use `basis`. */
  basis_components?: string[] | null;
  /** Migration 274 — show income before withholding (default true). */
  basis_pre_tax?: boolean | null;
}

/** Phase 1 — which base an overhead % multiplies. */
export type OverheadBasis =
  | 'income_gross'
  | 'income_show'
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
  /** Migration 274 — 'pct' (default) or 'flat'. */
  insurance_mode?: string | null;
  contingency_mode?: string | null;
  accountancy_mode?: string | null;
  /** Migration 274 — the projected amount when mode = 'flat'. */
  insurance_flat_amount?: number | null;
  contingency_flat_amount?: number | null;
  accountancy_flat_amount?: number | null;
  /** Migration 274 — a typed ACTUAL (the real invoice); null = computed. */
  insurance_actual_amount?: number | null;
  contingency_actual_amount?: number | null;
  accountancy_actual_amount?: number | null;
  /** Migration 274 — bank margin on projected foreign amounts (fraction). */
  fx_margin_pct?: number | null;
}

const KNOWN_COMPONENTS: readonly CommissionComponent[] = ['show', 'merch', 'vip', 'other'];

/** Migration 274 — the ticked parts of a commission, de-duplicated and in a
 *  stable order. null when nothing (valid) is ticked → the legacy `basis`. */
export function normalizeComponents(v: unknown): CommissionComponent[] | null {
  if (!Array.isArray(v)) return null;
  const set = new Set(v.map((x) => String(x).toLowerCase()));
  const parts = KNOWN_COMPONENTS.filter((k) => set.has(k));
  return parts.length ? parts : null;
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

  const margin = fxMargin(settings?.fx_margin_pct);

  // Base expenses — every non-income line, in tour currency (lineInTour: the
  // ONE conversion rule — projected at the live rate + bank margin on foreign
  // amounts; actual at the locked/paid rate). Migration 274: lines in an
  // 'income' section are OTHER INCOME, and refundable deposits that are owed
  // back / returned stay out of costs.
  let baseProjected = 0;
  let baseActual = 0;
  let otherProj = 0;
  let otherAct = 0;
  let otherCommProj = 0;
  let otherCommAct = 0;
  let owedProj = 0;
  let owedAct = 0;
  let returnedProj = 0;
  let returnedAct = 0;
  for (const l of lines) {
    if (isIncomeRow(l)) {
      const v = lineInTour(l, currency, fxRates, margin, 'income');
      otherProj += v.projected;
      otherAct += v.actual;
      if (l.income_commissionable !== false) {
        otherCommProj += v.projected;
        otherCommAct += v.actual;
      }
      continue;
    }
    const v = lineInTour(l, currency, fxRates, margin, 'cost');
    if (isHeldDeposit(l)) {
      if (refundableStatus(l) === 'returned') {
        returnedProj += v.projected;
        returnedAct += v.actual;
      } else {
        owedProj += v.projected;
        owedAct += v.actual;
      }
      continue;
    }
    baseProjected += v.projected;
    baseActual += v.actual;
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
  let showPreProj = 0;
  let showPreAct = 0;
  for (const i of income) {
    // Live FX (#currency 2.5) — convert this show's native income → tour currency.
    //   • PROJECTED amounts use the LIVE rate (fLive = the tour's current
    //     budget_fx_rates, 1 for tour currency / a rate-less currency).
    //   • ACTUAL amounts use the rate LOCKED at settlement (fLocked); a row that
    //     hasn't settled yet (locked_fx_rate NULL) falls back to the live rate, so
    //     nothing silently zeroes. Missing/≤0 locked rate → live rate (never 0).
    const showCcy = (i.currency || currency).toUpperCase();
    // Migration 274 — the bank margin cuts a FOREIGN projection (not actuals).
    const fLive =
      toTourCurrency(1, i.currency, currency, fxRates) * (showCcy !== currency ? 1 - margin : 1);
    const lr = num(i.locked_fx_rate);
    const fLocked = i.locked_fx_rate != null && lr > 0 ? lr : fLive;
    merchProj += num(i.merch_income) * fLive;
    merchAct += num(i.actual_merch) * fLocked;
    guarProj += postTaxGuar(i) * fLive;
    guarAct += num(i.actual_guarantee) * fLocked;
    overProj += postTaxOver(i) * fLive;
    overAct += num(i.actual_overage) * fLocked;
    vipProj += num(i.vip_income) * fLive;
    vipAct += num(i.actual_vip) * fLocked;
    dedAct += num(i.actual_deductions) * fLocked;
    showPreProj += (num(i.pre_tax_guarantee ?? i.post_tax_guarantee) + num(i.pre_tax_overage)) * fLive;
    showPreAct += (num(i.actual_guarantee) + num(i.actual_overage)) * fLocked;
    grossProj += (postTaxGuar(i) + postTaxOver(i) + num(i.merch_income) + num(i.vip_income)) * fLive;
    grossAct +=
      (num(i.actual_guarantee) +
        num(i.actual_overage) +
        num(i.actual_merch) +
        num(i.actual_vip) -
        num(i.actual_deductions)) * fLocked;
    preTaxProj +=
      (num(i.pre_tax_guarantee ?? i.post_tax_guarantee) +
        num(i.pre_tax_overage) +
        num(i.merch_income) +
        num(i.vip_income)) * fLive;
    preTaxAct +=
      (num(i.actual_guarantee) +
        num(i.actual_overage) +
        num(i.actual_merch) +
        num(i.actual_vip) -
        num(i.actual_deductions)) * fLocked;
  }

  // Migration 274 — Other income lines add to gross (and to the legacy
  // 'gross' / 'pre-tax' commission bases, which mean "all income").
  grossProj += otherProj;
  grossAct += otherAct;
  preTaxProj += otherProj;
  preTaxAct += otherAct;
  // Show income after tax: projected = post-withholding; actual = after the
  // settlement deductions (where withholding is itemised).
  const showPostProj = guarProj + overProj;
  const showPostAct = guarAct + overAct - dedAct;

  const insurancePct = num(settings?.insurance_pct);
  const contingencyPct = num(settings?.contingency_pct);
  const accountancyPct = num(settings?.accountancy_pct);
  const merchCogsPct = num(settings?.merch_cogs_pct);
  const insuranceBasis = (settings?.insurance_basis ?? 'income_gross') as OverheadBasis;
  const contingencyBasis = (settings?.contingency_basis ??
    'expenses_pre_contingency') as OverheadBasis;
  const accountancyBasis = (settings?.accountancy_basis ?? 'income_gross') as OverheadBasis;

  /* Migration 274 — an overhead is a % of its base OR a flat amount, and its
     ACTUAL can be the real invoice typed in (null = computed). */
  const modeOf = (v: unknown): OverheadMode => (v === 'flat' ? 'flat' : 'pct');
  const typed = (v: unknown): number | null =>
    v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
  const insuranceMode = modeOf(settings?.insurance_mode);
  const contingencyMode = modeOf(settings?.contingency_mode);
  const accountancyMode = modeOf(settings?.accountancy_mode);
  const insuranceTyped = typed(settings?.insurance_actual_amount);
  const contingencyTyped = typed(settings?.contingency_actual_amount);
  const accountancyTyped = typed(settings?.accountancy_actual_amount);
  const resolveOverhead = (
    mode: OverheadMode,
    flat: unknown,
    actualTyped: number | null,
    pctProjected: number,
    pctActual: number,
  ): PnlPair => ({
    projected: mode === 'flat' ? num(flat) : pctProjected,
    actual: actualTyped != null ? actualTyped : mode === 'flat' ? num(flat) : pctActual,
  });

  /* Phase 1 — resolve an overhead's configured base. The evaluation
     order is fixed (cogs → insurance → commissions → contingency →
     accountancy), so each base only references already-computed values
     (not-yet-computed ones are 0 in ctx) — no circularity. */
  const expenseBase = (
    basis: OverheadBasis,
    ctx: {
      gross: number;
      show: number;
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
      case 'income_show':
        return ctx.show;
      case 'income_gross':
      default:
        return ctx.gross;
    }
  };

  // COGS — merch only.
  const cogsProj = merchCogsPct * merchProj;
  const cogsAct = merchCogsPct * merchAct;

  // Insurance — commissions + contingency not yet known (0 in ctx).
  const insurancePctProj =
    insurancePct *
    expenseBase(insuranceBasis, {
      gross: grossProj,
      show: showPreProj,
      lineItems: baseProjected,
      commissions: 0,
      insurance: 0,
      contingency: 0,
    });
  const insurancePctAct =
    insurancePct *
    expenseBase(insuranceBasis, {
      gross: grossAct,
      show: showPreAct,
      lineItems: baseActual,
      commissions: 0,
      insurance: 0,
      contingency: 0,
    });

  const insuranceV = resolveOverhead(insuranceMode, settings?.insurance_flat_amount, insuranceTyped, insurancePctProj, insurancePctAct);
  const insuranceProj = insuranceV.projected;
  const insuranceAct = insuranceV.actual;

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

  /* Migration 274 — a commission over ticked parts of income. show = the
     deal money (guarantees + overages), before or after tax; merch = merch
     net of COGS; vip = VIP income; other = commissionable Other income. */
  const componentValue = (parts: CommissionComponent[], preTax: boolean, projected: boolean): number => {
    let v = 0;
    for (const part of parts) {
      if (part === 'show') {
        v += projected ? (preTax ? showPreProj : showPostProj) : preTax ? showPreAct : showPostAct;
      } else if (part === 'merch') {
        v += projected ? Math.max(0, merchProj - cogsProj) : Math.max(0, merchAct - cogsAct);
      } else if (part === 'vip') {
        v += projected ? vipProj : vipAct;
      } else if (part === 'other') {
        v += projected ? otherCommProj : otherCommAct;
      }
    }
    return Math.max(0, v);
  };

  const commissionRows: PnlCommissionRow[] = commissions.map((c) => {
    const pct = normalizeCommissionPct(c.percentage);
    const basis = c.basis ?? 'gross';
    const components = normalizeComponents(c.basis_components);
    const preTax = c.basis_pre_tax !== false;
    const value = (projected: boolean) =>
      components ? componentValue(components, preTax, projected) : basisValue(basis, projected);
    return {
      id: c.id,
      label: c.label,
      basis,
      components,
      preTax,
      pct,
      projected: pct * value(true),
      actual: pct * value(false),
    };
  });
  const commProj = commissionRows.reduce((a, r) => a + r.projected, 0);
  const commAct = commissionRows.reduce((a, r) => a + r.actual, 0);

  // Contingency — now commissions + insurance are known.
  const contingencyPctProj =
    contingencyPct *
    expenseBase(contingencyBasis, {
      gross: grossProj,
      show: showPreProj,
      lineItems: baseProjected,
      commissions: commProj,
      insurance: insuranceProj,
      contingency: 0,
    });
  const contingencyPctAct =
    contingencyPct *
    expenseBase(contingencyBasis, {
      gross: grossAct,
      show: showPreAct,
      lineItems: baseActual,
      commissions: commAct,
      insurance: insuranceAct,
      contingency: 0,
    });

  const contingencyV = resolveOverhead(contingencyMode, settings?.contingency_flat_amount, contingencyTyped, contingencyPctProj, contingencyPctAct);
  const contingencyProj = contingencyV.projected;
  const contingencyAct = contingencyV.actual;

  // Accountancy — everything except itself is known.
  const accountancyPctProj =
    accountancyPct *
    expenseBase(accountancyBasis, {
      gross: grossProj,
      show: showPreProj,
      lineItems: baseProjected,
      commissions: commProj,
      insurance: insuranceProj,
      contingency: contingencyProj,
    });
  const accountancyPctAct =
    accountancyPct *
    expenseBase(accountancyBasis, {
      gross: grossAct,
      show: showPreAct,
      lineItems: baseActual,
      commissions: commAct,
      insurance: insuranceAct,
      contingency: contingencyAct,
    });

  const accountancyV = resolveOverhead(accountancyMode, settings?.accountancy_flat_amount, accountancyTyped, accountancyPctProj, accountancyPctAct);
  const accountancyProj = accountancyV.projected;
  const accountancyAct = accountancyV.actual;

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
      other: { projected: otherProj, actual: otherAct },
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
    showIncome: {
      preTax: { projected: showPreProj, actual: showPreAct },
      postTax: { projected: showPostProj, actual: showPostAct },
    },
    deposits: {
      owedBack: { projected: owedProj, actual: owedAct },
      returned: { projected: returnedProj, actual: returnedAct },
    },
    fxMarginPct: margin,
    mode: {
      insurance: insuranceMode,
      contingency: contingencyMode,
      accountancy: accountancyMode,
    },
    actualOverridden: {
      insurance: insuranceTyped != null,
      contingency: contingencyTyped != null,
      accountancy: accountancyTyped != null,
    },
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
