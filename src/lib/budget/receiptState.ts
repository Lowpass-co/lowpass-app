/* ============================================
   LOWPASS — what state is this receipt in? (RQ-6)

   Adam, after dropping two real receipts that failed to scan:
   "now I don't know where they've gone."

   They HAD been saved — RCP-08 proves the row and the file land before the scan
   runs — but nothing in the app listed them, so from his side the files
   vanished. Save-first is worthless without a surface, and a surface needs one
   honest answer to "where is this?".

   THE STATE IS DERIVED, NEVER STORED. There is no status column on
   expense_receipts and this module does not add one: a stored status is a second
   source of truth that drifts the moment a proposal is applied or a line is
   deleted by another path. Everything here is computed from facts that already
   exist — the link to a line, and the receipt's proposal rows.

   Deliberately pure: no Supabase, no React. The loader passes rows in, the bank
   renders what comes out, and the rules are testable without a database.
   ============================================ */

/** The four states the Receipts bank filters by. */
export type ReceiptState = 'needs_details' | 'proposed' | 'filed' | 'rejected';

/** The proposal statuses `import_pending_lines` uses (migration 251). */
export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'skipped';

/** The subset of an expense_receipts row this derivation reads. */
export interface ReceiptStateInput {
  linked_line_item_id: string | null;
  vendor: string | null;
  date: string | null;
  cost_tour_currency: number | null;
  /** Statuses of this receipt's rows in import_pending_lines, if any. */
  proposalStatuses: ProposalStatus[];
}

export const RECEIPT_STATE_LABEL: Record<ReceiptState, string> = {
  needs_details: 'Needs details',
  proposed: 'Proposed',
  filed: 'Filed',
  rejected: 'Rejected',
};

/**
 * Order matters, and it is an order of CERTAINTY:
 *
 *  1. filed     — it reached a budget line. The strongest fact available, and it
 *                 wins even if an old proposal row is still lying around.
 *  2. proposed  — a proposal is waiting for review. Actionable, not lost.
 *  3. rejected  — every proposal was turned down. The receipt is still stored;
 *                 this is a resting state, not a failure.
 *  4. needs_details — everything else. A scan that failed, a scan that returned
 *                 nothing usable, or a file nobody has touched yet. This is the
 *                 bucket Adam's two receipts were invisibly sitting in, so it is
 *                 the DEFAULT rather than a special case — a receipt we cannot
 *                 classify is one that needs a human, not one we hide.
 */
export function deriveReceiptState(r: ReceiptStateInput): ReceiptState {
  if (r.linked_line_item_id) return 'filed';
  const statuses = r.proposalStatuses ?? [];
  if (statuses.includes('pending')) return 'proposed';
  // `accepted` without a link means the line it was filed against is gone;
  // that is not "filed" any more, and the receipt needs looking at.
  if (statuses.length > 0 && statuses.every((s) => s === 'rejected' || s === 'skipped')) {
    return 'rejected';
  }
  return 'needs_details';
}

/** Which fields a receipt is still missing before it could become a proposal. */
export function missingFields(r: ReceiptStateInput): string[] {
  const missing: string[] = [];
  if (!r.vendor?.trim()) missing.push('vendor');
  if (!r.date?.trim()) missing.push('date');
  if (r.cost_tour_currency == null || Number(r.cost_tour_currency) === 0) missing.push('amount');
  return missing;
}

/**
 * True when the receipt has everything a proposal needs. The bank uses this to
 * decide whether "Propose" is offered or the row asks for fields first — the
 * difference between a dead end and a next step.
 */
export function canPropose(r: ReceiptStateInput): boolean {
  return missingFields(r).length === 0 && !r.linked_line_item_id;
}

/** Counts per state, for the filter chips and the rail badge. */
export function countByState(rows: ReceiptStateInput[]): Record<ReceiptState, number> {
  const counts: Record<ReceiptState, number> = {
    needs_details: 0,
    proposed: 0,
    filed: 0,
    rejected: 0,
  };
  for (const r of rows) counts[deriveReceiptState(r)] += 1;
  return counts;
}

/**
 * The one number that goes on the rail badge. Needs-details is the only state
 * that represents work the user has to do — Proposed is queued, Filed is done,
 * Rejected is decided. Badging anything else would cry wolf.
 */
export function needsAttentionCount(rows: ReceiptStateInput[]): number {
  return countByState(rows).needs_details;
}
