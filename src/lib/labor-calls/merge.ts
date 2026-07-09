/* ============================================
   LOWPASS — Labor calls · additive / never-clobber merge (P6)

   ONE pure rule shared by template-apply AND intake-accept: incoming rows are
   ADDED to the day, but a row that duplicates an existing call (same department
   + call_time) is skipped — so applying a template twice, or a venue re-
   submitting the same intake, never double-creates and never overwrites the
   TM's existing rows. Empty rows (no department AND no company) are dropped.
   ============================================ */

import type { LaborCall, LaborCallRow } from './types';

/** Identity of a call for dedupe: department + call_time (case/space-normalised). */
function keyOf(r: { department?: string | null; call_time?: string | null }): string {
  return `${(r.department ?? '').trim().toLowerCase()}|${(r.call_time ?? '').trim()}`;
}

function isEmptyRow(r: LaborCallRow): boolean {
  return !(r.department ?? '').trim() && !(r.company ?? '').trim();
}

/** Given the day's EXISTING calls and a set of INCOMING rows (from a template or
 *  an intake submission), return ONLY the rows that should be CREATED — additive
 *  and never-clobber. Existing rows are never modified or removed. */
export function additiveLaborRows(existing: LaborCall[], incoming: LaborCallRow[]): LaborCallRow[] {
  const seen = new Set(existing.map(keyOf));
  const out: LaborCallRow[] = [];
  for (const r of incoming) {
    if (isEmptyRow(r)) continue; // never create an empty call
    const k = keyOf(r);
    if (seen.has(k)) continue; // never-clobber: a matching call already exists
    seen.add(k); // also dedupe within the incoming batch
    out.push(r);
  }
  return out;
}
