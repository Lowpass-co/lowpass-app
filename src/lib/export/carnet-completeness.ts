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
};

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

/** Zero is a legitimate declared value in principle, but a zero-value carnet
 *  line is refused as readily as a blank one, so it is treated as missing and
 *  named. Better to over-report here than to have a truck turned around. */
function missingAmount(v: unknown): boolean {
  if (v == null || v === '') return true;
  const n = typeof v === 'number' ? v : Number(v);
  return !Number.isFinite(n) || n <= 0;
}

export function analyseCarnetCompleteness(items: readonly CarnetCandidate[]): CarnetCompleteness {
  const incomplete: CarnetGap[] = [];
  for (const it of items) {
    const missing: CarnetRequiredField[] = [];
    if (missingText(it.country_of_origin)) missing.push('country_of_origin');
    if (missingText(it.customs_hs_code)) missing.push('customs_hs_code');
    if (missingAmount(it.value_amount)) missing.push('value_amount');
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
