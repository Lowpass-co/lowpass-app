/* ============================================================
   LOWPASS — Intake store-pending helpers (P7 · Q7)

   Q7: the venue's submission is NOT merged on submit. It is flattened into
   PENDING answers (one per answered field) stored in intake_pending_answers.
   The TM reviews them (ChangeReviewQueue = the apply gate); ACCEPT rebuilds an
   AdvanceData from the accepted rows and runs the SAME mergeIntakeIntoAdvance —
   so the never-clobber guard (intake.test.ts §12.4) fires at accept-time, not
   submit-time. Pure; no I/O.
   ============================================================ */

import type { AdvanceData } from './intake';

/** Mirrors intake.ts isEmptyAnswer (kept local so this pure module has no runtime
 *  relative import — it's exercised by a node harness). */
function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

export interface PendingAnswerInput {
  section_id: string;
  field_id: string;
  value: unknown;
}

/** Flatten a sanitized submission into pending answers. Empty answers are
 *  dropped here so they never become a pending row (and thus can never clobber
 *  a TM value at accept-time — the never-clobber discipline starts at capture). */
export function flattenToPending(clean: AdvanceData | null | undefined): PendingAnswerInput[] {
  const out: PendingAnswerInput[] = [];
  for (const [sectionId, fields] of Object.entries(clean ?? {})) {
    if (!fields || typeof fields !== 'object') continue;
    for (const [fieldId, value] of Object.entries(fields)) {
      if (isEmptyAnswer(value)) continue;
      out.push({ section_id: sectionId, field_id: fieldId, value });
    }
  }
  return out;
}

/** Rebuild an AdvanceData object from a set of pending answers — the input to
 *  mergeIntakeIntoAdvance at accept-time. */
export function pendingToAdvanceData(rows: PendingAnswerInput[]): AdvanceData {
  const out: AdvanceData = {};
  for (const r of rows) {
    (out[r.section_id] ??= {})[r.field_id] = r.value;
  }
  return out;
}

/** The field type used to mark a Labor-call block in the intake schema (P6). Its
 *  pending answers are applied to the labor_calls table (additive), NOT the
 *  advance JSON, so the accept path routes them separately. */
export const LABOR_CALL_FIELD_TYPE = 'labor_call';
