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
};

/* ── VALUE HAS TWO SOURCES, AND THEY ARE NOT THE SAME QUANTITY ─────────────
   Production carries value_amount NULL on all 33 rows and purchase_cost > 0 on
   all 33. Nothing populates value_amount: the two gear routes ACCEPT it
   (gear/route.ts:89, gear/[id]/route.ts:66) but no UI sends it, and the reason
   value_currency looks populated is that gear/route.ts:90 defaults it to 'GBP'
   on create. So the currency was never evidence of a partial write.

   Customs wants value FOR CUSTOMS PURPOSES — replacement or market value.
   purchase_cost is what was paid, which for a five-year-old amp is a different
   number. Falling back is honest as a DEFAULT and dishonest as a silent
   equivalence, so the fallback is used AND its provenance is labelled on the
   document. value_amount always wins when set.

   Derived at read time on purpose. A migration copying purchase_cost into
   value_amount would destroy the distinction permanently and could not be
   undone once someone edited either one. */

export type CarnetValueSource = 'declared' | 'purchase_cost' | 'none';

export function resolveCarnetValue(
  item: Pick<CarnetCandidate, 'value_amount' | 'purchase_cost'>,
): { amount: number | null; source: CarnetValueSource } {
  const declared = toAmount(item.value_amount);
  if (declared != null) return { amount: declared, source: 'declared' };
  const fallback = toAmount(item.purchase_cost);
  if (fallback != null) return { amount: fallback, source: 'purchase_cost' };
  return { amount: null, source: 'none' };
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
