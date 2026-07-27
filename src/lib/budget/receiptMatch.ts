/* ============================================
   LOWPASS — receipt → budget proposal engine (RC-2)

   PURE. Given a scanned receipt, the tour's budget lines and its existing
   transactions, decide ONE proposal:

     (a) receipt_txn   — link to an existing line; the amount lands as a
                         TRANSACTION against it.
     (b) receipt_line  — nothing matched; create a line, then the transaction.

   THE INVARIANT (useReceiptScan.ts:21, carried verbatim): the amount only ever
   lands as a transaction, which sums into actual_cost via the existing reconcile
   — never a direct actual_cost write. Note both shapes above end in a
   transaction. This module proposes; the apply path writes, and it writes
   through POST /api/budget/line-items/{id}/transactions, whose route inserts the
   txn and THEN calls syncActualCostIfNoOverride. A direct actual_cost write would
   bypass both the reconcile and the manual-override guard, which is why no code
   here ever produces one.

   MATCHING SIGNAL, in the spec's order:
     1. explicit category match
     2. vendor/description fuzzy match (nameSimilarity ≥ 0.85)
     3. amount proximity within the line's remaining estimate
     4. date within the tour window
   Each contributes to a score; the reason string names the signal that carried
   it, because "why did it match" is the thing a reviewer actually needs.

   REUSES dedupe.ts UNCHANGED. nameSimilarity is the same Dice-bigram function
   X1-B uses; the 0.85 threshold is applied HERE (caller-side), so the shared
   function keeps one behaviour for both callers.

   DUPLICATE GUARD: vendor + amount + date within tolerance of an EXISTING
   transaction → flagged, and defaults to SKIP. Mirrors X1-B's classification
   intent, expressed against transactions rather than lines.
   ============================================ */

import { nameSimilarity } from '@/lib/import/dedupe';

/** Threshold for a fuzzy vendor/description match. Caller-side, per the spec. */
export const NAME_THRESHOLD = 0.85;
/** Amount equality tolerance for the duplicate guard (1%). */
export const AMOUNT_TOLERANCE = 0.01;
/** Date proximity for the duplicate guard, in days. */
export const DUP_DATE_WINDOW_DAYS = 3;

/** The OCR fields this engine reads (a subset of ReceiptOcr). */
export interface ReceiptFacts {
  vendor: string | null;
  date: string | null;
  total_amount: number | null;
  currency: string | null;
  category: string | null;
  description: string | null;
}

import { resolveSection, type SectionOption } from './receiptSection';

/** A budget line as the matcher needs it. */
export interface BudgetLineFacts {
  id: string;
  sectionId: string | null;
  sectionName: string | null;
  label: string;
  category: string | null;
  /** proposed/estimated cost, in the tour currency. */
  estimate: number | null;
  /** already-recorded actual, so "remaining estimate" is computable. */
  actual: number | null;
  vendor: string | null;
}

/** An existing transaction, for the duplicate guard. */
export interface TransactionFacts {
  id: string;
  lineItemId: string;
  vendorName: string | null;
  amount: number;
  paidAt: string | null;
}

export type ProposalTarget = 'receipt_txn' | 'receipt_line';

export interface ReceiptProposal {
  target: ProposalTarget;
  /** Set for receipt_txn — the line the transaction attaches to. */
  lineItemId: string | null;
  /** Human-readable justification, shown in the review queue. */
  reason: string;
  /** 0..1 confidence; only meaningful for receipt_txn. */
  score: number;
  /** Duplicate guard — an existing transaction this probably repeats. */
  dupOf: string | null;
  dupReason: string | null;
  /** Proposals default to skip ONLY when flagged as a duplicate. */
  defaultAccept: boolean;
  /** The payload the apply path will POST. Amount is ALWAYS a transaction. */
  value: {
    vendor: string | null;
    date: string | null;
    amount: number | null;
    currency: string | null;
    /** receipt_line only — what to call the new line and where to put it. */
    label?: string;
    sectionId?: string | null;
    sectionName?: string | null;
    /** RQ-7 — the named section doesn't exist yet; apply should create it. */
    createSection?: boolean;
    /** RQ-7 — how the section was chosen, shown on the card. */
    sectionReason?: string;
  };
}

function norm(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function daysApart(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(ta - tb) / 86_400_000;
}

function withinTolerance(a: number, b: number, tol = AMOUNT_TOLERANCE): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= tol;
}

/** The receipt's best text handle for fuzzy matching. */
function receiptText(r: ReceiptFacts): string {
  return norm([r.vendor, r.description].filter(Boolean).join(' '));
}

interface Scored {
  line: BudgetLineFacts;
  score: number;
  reason: string;
}

/** Score ONE line against the receipt. Returns null when nothing connects. */
function scoreLine(r: ReceiptFacts, line: BudgetLineFacts, tourStart: string | null, tourEnd: string | null): Scored | null {
  const reasons: string[] = [];
  let score = 0;

  // 1. explicit category match — the strongest single signal.
  if (r.category && line.category && norm(r.category) === norm(line.category)) {
    score += 0.5;
    reasons.push(`category matches “${line.category}”`);
  }

  // 2. vendor / description fuzzy match against the line label AND its vendor.
  const text = receiptText(r);
  const bestName = Math.max(
    text ? nameSimilarity(text, norm(line.label)) : 0,
    text && line.vendor ? nameSimilarity(text, norm(line.vendor)) : 0,
  );
  if (bestName >= NAME_THRESHOLD) {
    score += 0.4;
    reasons.push(`vendor matches “${line.label}”`);
  } else if (bestName >= 0.6) {
    // Contributes, but never enough on its own to link.
    score += 0.15;
  }

  // 3. amount within the line's REMAINING estimate — a cost that still fits.
  if (r.total_amount != null && line.estimate != null) {
    const remaining = line.estimate - (line.actual ?? 0);
    if (remaining > 0 && r.total_amount <= remaining * 1.05) {
      score += 0.15;
      reasons.push('amount fits the remaining estimate');
    }
  }

  // 4. date inside the tour window — weak corroboration, never decisive.
  if (r.date && tourStart && tourEnd) {
    const d = r.date.slice(0, 10);
    if (d >= tourStart.slice(0, 10) && d <= tourEnd.slice(0, 10)) score += 0.05;
  }

  if (score <= 0 || reasons.length === 0) return null;
  return { line, score: Math.min(score, 1), reason: reasons.join(' · ') };
}

/** Find an existing transaction this receipt probably repeats. */
export function findDuplicateTransaction(
  r: ReceiptFacts,
  transactions: TransactionFacts[],
): TransactionFacts | null {
  if (r.total_amount == null) return null;
  for (const t of transactions) {
    if (!withinTolerance(t.amount, r.total_amount)) continue;
    const dd = daysApart(t.paidAt, r.date);
    if (dd !== null && dd > DUP_DATE_WINDOW_DAYS) continue;
    const vendorClose =
      !r.vendor || !t.vendorName || nameSimilarity(norm(r.vendor), norm(t.vendorName)) >= NAME_THRESHOLD;
    if (vendorClose) return t;
  }
  return null;
}

/**
 * The one entry point: propose an action for a scanned receipt.
 *
 * Always returns a proposal — when nothing matches, that proposal is
 * `receipt_line` (create it), which is the honest answer rather than silence.
 */
export function proposeForReceipt(
  receipt: ReceiptFacts,
  lines: BudgetLineFacts[],
  transactions: TransactionFacts[],
  opts: {
    tourStart?: string | null;
    tourEnd?: string | null;
    fallbackSectionName?: string | null;
    /* RQ-7 — the tour's real sections, so the receipt's category can be resolved
       to one instead of being dropped in Uncategorised. Defaults to the sections
       implied by `lines` when not supplied, so existing callers keep working. */
    sections?: SectionOption[];
  } = {},
): ReceiptProposal {
  const { tourStart = null, tourEnd = null, fallbackSectionName = 'Uncategorised' } = opts;

  const dup = findDuplicateTransaction(receipt, transactions);
  const dupOf = dup?.id ?? null;
  const dupReason = dup
    ? `Possible duplicate of an existing transaction${dup.vendorName ? ` from ${dup.vendorName}` : ''}${
        dup.paidAt ? ` on ${dup.paidAt.slice(0, 10)}` : ''
      }`
    : null;

  const scored = lines
    .map((l) => scoreLine(receipt, l, tourStart, tourEnd))
    .filter((s): s is Scored => s !== null)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const baseValue = {
    vendor: receipt.vendor,
    date: receipt.date,
    amount: receipt.total_amount,
    currency: receipt.currency,
  };

  // A link needs a real signal — category or a ≥0.85 name match. Amount/date
  // alone must never be enough to attach money to someone else's line.
  if (best && best.score >= 0.4) {
    return {
      target: 'receipt_txn',
      lineItemId: best.line.id,
      reason: best.reason,
      score: best.score,
      dupOf,
      dupReason,
      // Duplicates default to SKIP — the user opts in, per the spec.
      defaultAccept: dupOf === null,
      value: baseValue,
    };
  }

  // (b) nothing matched → propose a new line, in the receipt's category section
  // when we can name one, else the catch-all.
  /* RQ-7 — resolve the category to a REAL section (exact → containment → alias →
     fuzzy), and propose creating one when nothing fits. The old code did a single
     exact-name comparison, so "catering" missed "Catering & Hospitality" and the
     line landed in Uncategorised with the signal still sitting in the payload. */
  const sectionPool: SectionOption[] =
    opts.sections ??
    [...new Map(
      lines
        .filter((l) => l.sectionName?.trim())
        .map((l) => [l.sectionName as string, { id: l.sectionId, name: l.sectionName as string }]),
    ).values()];
  const section = resolveSection(receipt.category, sectionPool, fallbackSectionName ?? 'Uncategorised');
  const label = [receipt.vendor, receipt.description].filter(Boolean).join(' — ') || 'Receipt';

  return {
    target: 'receipt_line',
    lineItemId: null,
    reason: best
      ? 'No confident match — proposing a new line'
      : 'Nothing in the budget matches — proposing a new line',
    score: best?.score ?? 0,
    dupOf,
    dupReason,
    defaultAccept: dupOf === null,
    value: {
      ...baseValue,
      label,
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      createSection: section.createSection,
      sectionReason: section.reason,
    },
  };
}
