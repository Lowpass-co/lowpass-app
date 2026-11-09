/* ============================================
   LOWPASS — a show's money: Expected vs Actual (Nov 2026, Adam)

   Income & settlements is ONE page: the shows on the left, the picked show on
   the right with its deal (Expected — what it should pay) beside the night
   (Actual — what it did pay). Rules here, pure; the page is
   src/components/income/ShowMoneyClient.tsx.

     Expected — the show's ONE deal, budget_income (typed on this page only).
     Actual   — typed ONLY on the settlement (the walk); the settlement carries
                it to the income row. (VIP is paid outside the promoter's
                settlement; its actual is typed here and stored on the income
                row — the only actual that is.)

   Status is honest: a show nobody has touched is Upcoming or To settle, never
   "Settled" or a green $0.
   ============================================ */

import type { IncomeRow } from '@/lib/budget/income';
import type { ShowWalk } from '@/lib/settlement/loadWalk';

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};
const clampPct = (v: unknown) => Math.max(0, Math.min(100, n(v)));

export interface Expected {
  /** Pre-tax guarantee. */
  guarantee: number;
  withholdingPct: number;
  /** Withholding taken off the guarantee + overage. */
  withholding: number;
  /** Pre-tax overage (projected for Versus / Door, typed for Plus). */
  overage: number;
  merch: number;
  vip: number;
  /** guarantee + overage − withholding + merch — what the settlement should
   *  come to (VIP is paid separately). */
  settlementTotal: number;
  /** settlementTotal + VIP — the income the budget expects. Equals the old
   *  "Contracted" figure exactly. */
  total: number;
}

export function expectedOf(row: Pick<IncomeRow, 'pre_tax_guarantee' | 'withholding_pct' | 'pre_tax_overage' | 'merch_income' | 'vip_income'> | null): Expected {
  const guarantee = n(row?.pre_tax_guarantee);
  const overage = n(row?.pre_tax_overage);
  const withholdingPct = clampPct(row?.withholding_pct);
  const withholding = (guarantee + overage) * (withholdingPct / 100);
  const merch = n(row?.merch_income);
  const vip = n(row?.vip_income);
  const settlementTotal = guarantee + overage - withholding + merch;
  return { guarantee, withholdingPct, withholding, overage, merch, vip, settlementTotal, total: settlementTotal + vip };
}

/** Anything typed on the night (any figure, line or payment). */
export function hasNightFigures(w: ShowWalk | null): boolean {
  if (!w) return false;
  return (
    w.guarantee !== 0 ||
    w.overage !== 0 ||
    w.merch !== 0 ||
    w.depositReceived !== 0 ||
    w.deductions.length > 0 ||
    w.deductionsAreLegacy ||
    w.expenses.length > 0 ||
    w.payments.length > 0 ||
    w.ticketsSold != null ||
    w.grossBO != null
  );
}

export type ShowStatus = 'upcoming' | 'to_settle' | 'in_progress' | 'awaiting_payment' | 'settled';

export const STATUS_LABEL: Record<ShowStatus, string> = {
  upcoming: 'Upcoming',
  to_settle: 'To settle',
  in_progress: 'In progress',
  awaiting_payment: 'Awaiting payment',
  settled: 'Settled',
};

/** Which statuses want the TM (amber). */
export const NEEDS_YOU: ReadonlySet<ShowStatus> = new Set(['to_settle', 'in_progress', 'awaiting_payment']);

export function showStatus(date: string | null, w: ShowWalk | null, today: string): ShowStatus {
  if (w?.fullAndFinal) return w.walk.outstanding > 0.005 ? 'awaiting_payment' : 'settled';
  if (hasNightFigures(w)) return 'in_progress';
  return date != null && date < today ? 'to_settle' : 'upcoming';
}

export interface ShowMoneyRow {
  routingId: string;
  date: string | null;
  venue: string | null;
  city: string | null;
  dayType: string | null;
  /** The show's own currency (the deal's), else the tour's. */
  currency: string;
  income: IncomeRow | null;
  walk: ShowWalk | null;
  expected: Expected;
  status: ShowStatus;
}

/** Every show (and any other day that has income), in date order. Rows are
 *  joined on routing id; the walk exists for every show / festival day. */
export function buildShowList(
  income: readonly IncomeRow[],
  walks: readonly ShowWalk[],
  tourCurrency: string,
  today: string,
): ShowMoneyRow[] {
  const byId = new Map<string, ShowMoneyRow>();
  const native = (tourCurrency || 'GBP').toUpperCase();
  for (const w of walks) {
    byId.set(w.routingId, {
      routingId: w.routingId,
      date: w.date,
      venue: w.venue_name,
      city: w.city,
      dayType: w.day_type,
      currency: native,
      income: null,
      walk: w,
      expected: expectedOf(null),
      status: 'upcoming',
    });
  }
  for (const r of income) {
    const e = expectedOf(r);
    const cur = byId.get(r.routing_id);
    // A non-show day only belongs here when it has income on it.
    if (!cur && e.total === 0) continue;
    byId.set(r.routing_id, {
      routingId: r.routing_id,
      date: cur?.date ?? r.date,
      venue: cur?.venue ?? r.venue_name,
      city: cur?.city ?? r.city,
      dayType: cur?.dayType ?? r.day_type,
      currency: (r.currency || native).toUpperCase(),
      income: r,
      walk: cur?.walk ?? null,
      expected: e,
      status: 'upcoming',
    });
  }
  const rows = [...byId.values()];
  for (const r of rows) r.status = showStatus(r.date, r.walk, today);
  return rows.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.routingId.localeCompare(b.routingId));
}

/** "2 to settle · 1 awaiting payment · 4 settled · 6 upcoming" — counts only:
 *  shows can be in different currencies, so no cross-currency money sum. */
export function statusSummary(rows: readonly ShowMoneyRow[]): string {
  const order: ShowStatus[] = ['to_settle', 'in_progress', 'awaiting_payment', 'settled', 'upcoming'];
  const parts = order
    .map((s) => ({ s, c: rows.filter((r) => r.status === s).length }))
    .filter((x) => x.c > 0)
    .map((x) => `${x.c} ${STATUS_LABEL[x.s].toLowerCase()}`);
  return parts.length ? parts.join(' · ') : 'No shows yet';
}

/** The first show to open: the one that most needs you, else the next
 *  upcoming, else the last. */
export function defaultShowId(rows: readonly ShowMoneyRow[]): string | null {
  return (
    rows.find((r) => r.status === 'to_settle' || r.status === 'in_progress' || r.status === 'awaiting_payment')?.routingId ??
    rows.find((r) => r.status === 'upcoming')?.routingId ??
    rows[rows.length - 1]?.routingId ??
    null
  );
}

/** The figures "Fill from the deal" types onto the settlement: the expected
 *  guarantee, overage and merch (pre-tax — withholding is a deduction line
 *  on the night). Only blank actuals are filled. */
export function fillFromDeal(e: Expected, w: ShowWalk | null): { reconciled_guarantee?: number; reconciled_overage?: number; reconciled_merch?: number } {
  const out: { reconciled_guarantee?: number; reconciled_overage?: number; reconciled_merch?: number } = {};
  if (!w || w.guarantee === 0) if (e.guarantee) out.reconciled_guarantee = e.guarantee;
  if (!w || w.overage === 0) if (e.overage) out.reconciled_overage = e.overage;
  if (!w || w.merch === 0) if (e.merch) out.reconciled_merch = e.merch;
  return out;
}
