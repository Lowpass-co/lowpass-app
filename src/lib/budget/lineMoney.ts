/* ============================================
   LOWPASS — one budget line → tour currency (migration 274)

   The ONE place a line item's projected + actual are converted into the tour
   currency. computeBudgetPnl, sheetTotalsBySection and loadTourPnl's
   breakdown all call this, so the sheet's section rows can never disagree with
   the P&L under them (the Σ rows === baseExpenses invariant is pinned by test).

     • PROJECTED → the live tour rate, plus the bank margin on a FOREIGN amount
       (income × (1 − m), cost × (1 + m)): what the bank will actually give /
       take, not the market mid-rate.
     • ACTUAL → the rate locked when the line first actualized (or the rate the
       bank really paid, typed on the line), else the live rate. No margin: an
       actual is a real figure.

   A refundable deposit that is still owed back (`pending`) or came back
   (`returned`) is not a cost: `heldDeposit` reports it so the P&L can keep it
   out of expenses and show it as money owed back. `forfeited` (or NULL) is an
   ordinary cost.

   Pure — no I/O.
   ============================================ */

import { convertToTour, type FxRateMap } from '@/lib/budget/fxRates';
import { getEffectiveActual } from '@/lib/budget/transactions';
import type { BudgetLineItem } from '@/types';

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** The bank margin as a usable fraction: 0 ≤ m < 0.5 (anything else → 0). */
export function fxMargin(v: unknown): number {
  const m = num(v);
  return m > 0 && m < 0.5 ? m : 0;
}

export type RefundableStatus = 'pending' | 'returned' | 'forfeited';

export function refundableStatus(l: Pick<BudgetLineItem, 'refundable_status'>): RefundableStatus | null {
  const s = (l.refundable_status ?? '').toLowerCase();
  return s === 'pending' || s === 'returned' || s === 'forfeited' ? s : null;
}

/** True when the line is a refundable deposit that is NOT a cost (owed back or returned). */
export function isHeldDeposit(l: Pick<BudgetLineItem, 'refundable_status'>): boolean {
  const s = refundableStatus(l);
  return s === 'pending' || s === 'returned';
}

export interface LineInTour {
  projected: number;
  actual: number;
  /** The line's currency differs from the tour currency. */
  foreign: boolean;
}

/**
 * Convert one line into the tour currency.
 * @param side 'cost' for expense lines, 'income' for other-income lines —
 *             decides which way the bank margin cuts on a foreign projection.
 */
export function lineInTour(
  l: BudgetLineItem,
  tourCurrency: string,
  fxRates: FxRateMap,
  margin: number,
  side: 'cost' | 'income',
): LineInTour {
  const ccy = (tourCurrency || 'GBP').toUpperCase();
  const lcur = (l.currency || ccy).toUpperCase();
  const foreign = lcur !== ccy;
  const m = foreign ? fxMargin(margin) : 0;
  const lr = num(l.locked_fx_rate);
  const projected =
    convertToTour(num(l.proposed_cost), lcur, ccy, fxRates) * (side === 'cost' ? 1 + m : 1 - m);
  const actual = convertToTour(getEffectiveActual(l), lcur, ccy, fxRates, lr > 0 ? lr : null);
  return { projected, actual, foreign };
}
