/* ============================================
   LOWPASS — carnet general-list completeness

   THE REAL-WORLD FAILURE THIS EXISTS FOR. A carnet general list with gaps is
   refused at the counter. Not queried, not corrected — refused, with a truck
   outside. The fields that get a list bounced are country of origin, HS code
   and value; without them a customs officer cannot assess the goods at all.

   So this is a pure, tested predicate that names WHICH item is missing WHICH
   field. Two rules follow from how it fails in practice:

     · EXPORT IS STILL ALLOWED. A partial list is genuinely useful — it is what
       you print to fill in by hand, and blocking it would make the tool useless
       exactly when it is needed most.
     · NEVER EMIT A SILENT BLANK. An empty cell reads as "nothing to declare".
       Missing fields render as a visible marker so the gap is impossible to
       miss on paper, which is where this document is actually read.

   Pure on purpose: no Supabase, no rendering. The document builder and the UI
   pre-flight both call it, so the count in the warning and the marks in the PDF
   can never disagree.
   ============================================ */

/** The three fields a carnet general list is refused without. */
export const CARNET_REQUIRED_FIELDS = [
  'country_of_origin',
  'customs_hs_code',
  'value_amount',
] as const;

export type CarnetRequiredField = (typeof CARNET_REQUIRED_FIELDS)[number];

export const CARNET_FIELD_LABELS: Record<CarnetRequiredField, string> = {
  country_of_origin: 'Country of origin',
  customs_hs_code: 'HS code',
  value_amount: 'Value',
};

export type CarnetCandidate = {
  id: string;
  name: string | null;
  country_of_origin?: string | null;
  customs_hs_code?: string | null;
  value_amount?: number | string | null;
  /** D1-L1 fallback source — see resolveCarnetValue. */
  purchase_cost?: number | string | null;
  /** Unit for value_amount ONLY. Never for purchase_cost — see R3-1. */
  value_currency?: string | null;
};

/* ── VALUE HAS TWO SOURCES, AND THEY ARE NOT THE SAME QUANTITY ─────────────
   Production carries value_amount NULL on all 33 rows and purchase_cost > 0 on
   all 33. Nothing populates value_amount: the two gear routes ACCEPT it
   (gear/route.ts:89, gear/[id]/route.ts:66) but no UI sends it — `Gear` in
   lib/types/gear.ts has no value_amount field, so the slide-over cannot send it
   even by spread.

   WHY value_currency LOOKS POPULATED — corrected. An earlier version of this
   comment blamed the create route's `?? 'GBP'` default. That is not the cause:
   gear_native_no_provenance = 0, so all 33 rows arrived through the 248
   backfill and the create route has plausibly never run for any of them. The
   real sources are 247:27 (ADD COLUMN value_currency TEXT DEFAULT 'GBP', which
   stamped every pre-existing row when 247 ran) and 248:78
   (COALESCE(ri.value_currency, 'GBP') in the backfill INSERT, alongside a null
   ri.value_amount and a populated ri.purchase_cost at :77). Both fit the
   observed shape exactly; the route explained it only by coincidence.

   The conclusion still holds — the currency was never evidence of a partial
   write — but the reason matters, because the next reader inherits whatever
   this file claims.

   Customs wants value FOR CUSTOMS PURPOSES — replacement or market value.
   purchase_cost is what was paid, which for a five-year-old amp is a different
   number. Falling back is honest as a DEFAULT and dishonest as a silent
   equivalence, so the fallback is used AND its provenance is labelled on the
   document. value_amount always wins when set.

   Derived at read time on purpose. A migration copying purchase_cost into
   value_amount would destroy the distinction permanently and could not be
   undone once someone edited either one. */

export type CarnetValueSource = 'declared' | 'purchase_cost' | 'none';

export type CarnetValue = {
  amount: number | null;
  source: CarnetValueSource;
  /** NULL means the unit is UNKNOWN, not that it is missing formatting. A
   *  caller must print no symbol rather than reach for another column. */
  currency: string | null;
};

/* ── R3-1: THE SYMBOL COMES FROM THE SAME FACT AS THE NUMBER ────────────────
   The first cut of this fallback printed `value_currency` beside a
   purchase_cost figure. That is R2-6 again — the bug that shipped £17,189.10
   over a dollar number — on a document a customs broker assesses duty from.

   purchase_cost HAS NO CURRENCY COLUMN. Not on gear (247:22), not on
   rental_inventory (092:43); there is no purchase_cost_currency anywhere in the
   repo. It is a naked NUMERIC — a scalar with no unit. And value_currency is
   free-text with no ISO-4217 validation (247:27, and gear/[id]/route.ts:67
   stores any string a caller sends), so it can perfectly well read 'USD' over a
   purchase cost typed in GBP years earlier.

   So the currency is returned HERE, next to the amount it belongs to, and it is
   NULL for a fallback. "300, currency unrecorded" is the only defensible
   statement. Deriving the symbol from a different column than the number is
   precisely what resolveQuoteDisplay exists to prevent. */
export function resolveCarnetValue(
  item: Pick<CarnetCandidate, 'value_amount' | 'purchase_cost' | 'value_currency'>,
): CarnetValue {
  const declared = toAmount(item.value_amount);
  if (declared != null) {
    /* Declared amount and declared currency describe the same quantity. */
    const cur = typeof item.value_currency === 'string' && item.value_currency.trim() !== ''
      ? item.value_currency.trim()
      : null;
    return { amount: declared, source: 'declared', currency: cur };
  }
  const fallback = toAmount(item.purchase_cost);
  if (fallback != null) return { amount: fallback, source: 'purchase_cost', currency: null };
  return { amount: null, source: 'none', currency: null };
}

/* ── R3-1: TOTALS ─────────────────────────────────────────────────────────
   A bare sum across rows with different currencies — or any row whose currency
   is unknown — is a mixed-unit figure with the symbol dropped entirely. On a
   carnet a wrong total is worse than no total, so this refuses rather than
   guesses, and the document prints per-currency subtotals plus an explicit
   note instead. */
export type CarnetTotals = {
  /** One entry per known currency, plus one for the unknown-unit rows. */
  byCurrency: { currency: string | null; amount: number; rows: number }[];
  /** True only when every valued row shares ONE known currency. */
  summable: boolean;
  /** Any row whose unit could not be established (a purchase-cost fallback). */
  hasUnknownUnit: boolean;
};

export function summariseCarnetValues(items: readonly CarnetCandidate[]): CarnetTotals {
  const buckets = new Map<string, { currency: string | null; amount: number; rows: number }>();
  let hasUnknownUnit = false;
  for (const it of items) {
    const v = resolveCarnetValue(it);
    if (v.amount == null) continue;
    if (v.currency == null) hasUnknownUnit = true;
    const key = v.currency ?? '\u0000unknown';
    const b = buckets.get(key) ?? { currency: v.currency, amount: 0, rows: 0 };
    b.amount += v.amount;
    b.rows += 1;
    buckets.set(key, b);
  }
  const byCurrency = [...buckets.values()].sort((a, b) =>
    (a.currency ?? '\uffff').localeCompare(b.currency ?? '\uffff'),
  );
  return { byCurrency, summable: byCurrency.length === 1 && !hasUnknownUnit, hasUnknownUnit };
}

function toAmount(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export type CarnetGap = {
  id: string;
  name: string;
  missing: CarnetRequiredField[];
};

export type CarnetCompleteness = {
  total: number;
  incomplete: CarnetGap[];
  /** "3 of 33 items incomplete" — the summary line, built once so the UI and
   *  the document cannot word it differently. */
  summary: string;
};

/** A value counts as present only if it is really there. Empty strings and
 *  whitespace are what a half-filled form actually contains, and they must not
 *  pass as filled — that is the silent blank arriving by another route. */
function missingText(v: unknown): boolean {
  return v == null || typeof v !== 'string' || v.trim() === '';
}

/* Zero-or-negative counts as absent in toAmount above: a zero-value carnet
   line is refused as readily as a blank one. Better to over-report than to have
   a truck turned around. */

export function analyseCarnetCompleteness(items: readonly CarnetCandidate[]): CarnetCompleteness {
  const incomplete: CarnetGap[] = [];
  for (const it of items) {
    const missing: CarnetRequiredField[] = [];
    if (missingText(it.country_of_origin)) missing.push('country_of_origin');
    if (missingText(it.customs_hs_code)) missing.push('customs_hs_code');
    /* Either source satisfies the requirement — see resolveCarnetValue. */
    if (resolveCarnetValue(it).amount == null) missing.push('value_amount');
    if (missing.length > 0) {
      incomplete.push({ id: it.id, name: it.name?.trim() || 'Untitled item', missing });
    }
  }
  const total = items.length;
  const summary =
    incomplete.length === 0
      ? `All ${total} item${total === 1 ? '' : 's'} complete`
      : `${incomplete.length} of ${total} item${total === 1 ? '' : 's'} incomplete`;
  return { total, incomplete, summary };
}

/** What a missing cell prints as. Never an empty string — see the header. */
export const CARNET_GAP_MARK = '— MISSING —';

/** Render a required cell: the value, or the visible gap mark. */
export function carnetCell(v: unknown): { text: string; missing: boolean } {
  if (typeof v === 'string' && v.trim() !== '') return { text: v.trim(), missing: false };
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return { text: String(v), missing: false };
  return { text: CARNET_GAP_MARK, missing: true };
}
