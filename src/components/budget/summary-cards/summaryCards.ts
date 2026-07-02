/* ============================================
   LOWPASS — Budget Summary card dashboard config (#29, approved design)

   The Summary tab as a customizable brick dashboard. Pure (no I/O / no React) so
   the default-parity + normalize invariants are node-testable. Phase 1 keeps the
   layout IN-MEMORY (no DB — persistence is Phase 2). Every figure is presentation-
   only over computeBudgetPnl / the line+income source; a brick NEVER recomputes.
   ============================================ */

export type SummaryCardId =
  | 'net-pnl'
  | 'expenses-by-section'
  | 'per-show-pnl'
  | 'committed-burn'
  | 'overheads-commissions'
  | 'gross-income'
  | 'total-expenses'
  | 'variance';

export interface SummaryCardConfig {
  id: SummaryCardId;
  show: boolean;
}

export interface SummaryDashboardConfig {
  v: 1;
  cards: SummaryCardConfig[];
}

/** The five default (shown) bricks, in the approved order, then the three palette
 *  (hidden) bricks a user can reveal via "+ Add card". */
export const SUMMARY_CARD_ORDER: readonly SummaryCardId[] = [
  'net-pnl',
  'expenses-by-section',
  'per-show-pnl',
  'committed-burn',
  'overheads-commissions',
  'gross-income',
  'total-expenses',
  'variance',
] as const;

const DEFAULT_SHOWN = new Set<SummaryCardId>([
  'net-pnl',
  'expenses-by-section',
  'per-show-pnl',
  'committed-burn',
  'overheads-commissions',
]);

export const SUMMARY_CARD_LABELS: Record<SummaryCardId, string> = {
  'net-pnl': 'Net P&L',
  'expenses-by-section': 'Expenses by section',
  'per-show-pnl': 'Per-show income',
  'committed-burn': 'Committed & burn',
  'overheads-commissions': 'Overheads & commissions',
  'gross-income': 'Gross income',
  'total-expenses': 'Total expenses',
  variance: 'Variance (projected vs actual)',
};

/** `net-pnl` is the full-width hero; the rest flow in the responsive grid. */
export const FULL_WIDTH_CARDS = new Set<SummaryCardId>(['net-pnl', 'expenses-by-section']);

export const DEFAULT_SUMMARY_CONFIG: SummaryDashboardConfig = {
  v: 1,
  cards: SUMMARY_CARD_ORDER.map((id) => ({ id, show: DEFAULT_SHOWN.has(id) })),
};

const KNOWN = new Set<SummaryCardId>(SUMMARY_CARD_ORDER);

/** Coerce any value into a valid config: keep known cards in the saved order, drop
 *  unknown ids + dupes, append any missing card (canonical order, hidden by default
 *  unless it's a default-shown one) so a card added in code appears for old layouts.
 *  Mirrors the export normalizeConfig contract. */
export function normalizeSummaryConfig(raw: unknown): SummaryDashboardConfig {
  const seen = new Set<SummaryCardId>();
  const cards: SummaryCardConfig[] = [];
  const rawCards =
    raw && typeof raw === 'object' && Array.isArray((raw as { cards?: unknown }).cards)
      ? (raw as { cards: unknown[] }).cards
      : [];
  for (const c of rawCards) {
    if (!c || typeof c !== 'object') continue;
    const id = (c as { id?: unknown }).id as SummaryCardId;
    if (!KNOWN.has(id) || seen.has(id)) continue;
    seen.add(id);
    cards.push({ id, show: (c as { show?: unknown }).show !== false });
  }
  for (const id of SUMMARY_CARD_ORDER) {
    if (!seen.has(id)) cards.push({ id, show: DEFAULT_SHOWN.has(id) });
  }
  return { v: 1, cards };
}
