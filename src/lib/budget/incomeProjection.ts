/* ============================================
   LOWPASS — Deal-aware income projection engine (Income Phase 3)

   PURE math (no I/O), so the same engine runs server-side (materialise on the
   income POST) and in the unit test. Reproduces Adam's reference budget
   (ROUTING & INCOME) — decisions LOCKED 2026-06-25, INCOME_P3_PROJECTION_MAP.md.

   THE MODEL (per show):
     tickets        = round(Cap × SellThru)
     perTicketNBOR  = Face × (1 − Tax%)                    -- tax off the top
     ArtistShare    = MARGINAL tier on the ticket count:
                        T null / tickets ≤ T → p1 × tickets × perTicketNBOR
                        else                 → perTicketNBOR × (p1×T + p2×(tickets − T))
     preTaxOverage  = max(0, ArtistShare − preTaxGuarantee) × Haircut
     Merch          = Cap × SellThru × DollarsPerHead(net) × MerchFee%
     VIP            = VipTickets × VipPrice

   ── WITHHOLDING IS NOT APPLIED HERE ──
   The reference formula's `× (1 − WH%)` is applied DOWNSTREAM by computeBudgetPnl
   (`postTaxOver = pre_tax_overage × (1 − wh/100)`, computeBudgetPnl.ts:157) — the
   same path every manual / PLUS overage already takes. We write the *pre-withholding*
   (haircut'd) overage into `pre_tax_overage` so WH is applied exactly once and the
   P&L stays byte-unchanged. End-to-end: max(0, share − guar) × Haircut × (1 − WH) =
   the reference number. (See the unit test's "full formula" assertions.)

   DEAL TYPES (LOCKED): VS auto-projects; PLUS is MANUAL (engine writes no overage —
   user-entered, matches the sheet's "PLUS excluded"); FLAT has no backend (no
   auto overage). Only VS produces a projected overage. Tiering is MARGINAL — the
   escalated % applies only to tickets ABOVE the threshold.

   UNITS: this engine works entirely in FRACTIONS (0.55, 0.80, 0.08) and native
   currency. The income route normalises the 0–100 stored percentages + applies the
   per-tour default fallback before calling in. Currency-agnostic: every figure is in
   the show's native currency; the P&L converts to the tour currency (Phase 2).
   ============================================ */

export type DealType = 'VS' | 'PLUS' | 'FLAT';

export interface ProjectionInput {
  /** Venue capacity (ticket count). */
  capacity: number | null;
  /** Sell-through as a FRACTION (0.80), already defaulted from the tour. */
  sellThru: number | null;
  /** Ticket face value (native ccy). */
  faceValue: number | null;
  dealType: DealType | null;
  /** Base deal share as a FRACTION (0.55). */
  dealPct: number | null;
  /** Tiered escalator: ticket-count threshold (nullable → no tier). */
  dealThreshold: number | null;
  /** Escalated share above the threshold, FRACTION (null → = dealPct). */
  dealPctAbove: number | null;
  /** Net merch $/head (native ccy), already defaulted from the tour. */
  dollarsPerHead: number | null;
  /** Avg merch fee as a FRACTION (0.20), already defaulted from the tour. */
  merchFeePct: number | null;
  vipTickets: number | null;
  /** VIP price (native ccy). */
  vipPrice: number | null;
  /** Pre-tax guarantee (native ccy) — the VS greater-of floor. */
  preTaxGuarantee: number | null;
}

export interface ProjectionConfig {
  /** Projection conservatism, FRACTION (default 0.65). */
  haircut: number;
  /** Tax off the top of gross box office, FRACTION (default 0.08). */
  taxPct: number;
}

export interface ProjectionOutput {
  /** Pre-withholding, haircut'd projected overage (native ccy). null = engine
   *  wrote nothing (PLUS / FLAT / no deal / insufficient inputs). */
  preTaxOverage: number | null;
  /** Projected merch income (native ccy). null = insufficient inputs. */
  merchIncome: number | null;
  /** Projected VIP income (native ccy). null = insufficient inputs. */
  vipIncome: number | null;
}

export const DEFAULT_PROJECTION_CONFIG: ProjectionConfig = { haircut: 0.65, taxPct: 0.08 };

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Artist's gross share of net box office, MARGINAL tiering. Exposed for the test. */
export function artistShare(input: ProjectionInput, taxPct: number): number | null {
  if (!isNum(input.capacity) || !isNum(input.sellThru) || !isNum(input.faceValue) || !isNum(input.dealPct)) {
    return null;
  }
  const tickets = Math.round(input.capacity * input.sellThru);
  const perTicketNBOR = input.faceValue * (1 - taxPct);
  const T = input.dealThreshold;
  const p1 = input.dealPct;
  const p2 = isNum(input.dealPctAbove) ? input.dealPctAbove : p1;
  if (!isNum(T) || tickets <= T) {
    return p1 * tickets * perTicketNBOR;
  }
  // Marginal: base % up to the threshold, escalated % only on the excess.
  return perTicketNBOR * (p1 * T + p2 * (tickets - T));
}

/** The engine. Returns the values to materialise into the proposed value columns
 *  (`pre_tax_overage`, `merch_income`, `vip_income`); null = leave the column alone. */
export function projectIncome(input: ProjectionInput, config: ProjectionConfig): ProjectionOutput {
  // ── Overage — VS only. PLUS is manual; FLAT / no-deal have no backend. ──
  let preTaxOverage: number | null = null;
  if (input.dealType === 'VS') {
    const share = artistShare(input, config.taxPct);
    if (share !== null) {
      const guar = isNum(input.preTaxGuarantee) ? input.preTaxGuarantee : 0;
      preTaxOverage = Math.max(0, share - guar) * config.haircut;
    }
  }

  // ── Merch — independent of the deal; cap × sell-thru × $/head × fee%. ──
  let merchIncome: number | null = null;
  if (isNum(input.capacity) && isNum(input.sellThru) && isNum(input.dollarsPerHead) && isNum(input.merchFeePct)) {
    merchIncome = input.capacity * input.sellThru * input.dollarsPerHead * input.merchFeePct;
  }

  // ── VIP — tickets × price. ──
  let vipIncome: number | null = null;
  if (isNum(input.vipTickets) && isNum(input.vipPrice)) {
    vipIncome = input.vipTickets * input.vipPrice;
  }

  return { preTaxOverage, merchIncome, vipIncome };
}
