/* ============================================
   LOWPASS — Workbook import dedupe / classification (X1-B)

   Classifies each proposed budget line against the existing lines:
     • new          — no match → default ACCEPT.
     • exact_dup    — same section + fuzzy name ≥0.85 + amount within 1% → default SKIP.
     • value_change — matches a line by name but the amount differs → possible
                      duplicate, "replace value" → default SKIP (user opts in).

   Pure; the route feeds it existing lines + the proposals. Fuzzy name = Dice
   bigram coefficient (order-insensitive, robust to minor edits).
   ============================================ */

import type { ParsedProposal } from '@/lib/import/parseWorkbook';

export interface ExistingLine {
  id: string;
  section: string;
  label: string;
  amount: number; // the comparable amount (proposed_cost or actual_cost)
}

export type DupKind = 'new' | 'exact_dup' | 'value_change';

export interface ClassifiedProposal {
  proposal: ParsedProposal;
  kind: DupKind;
  dupOf: string | null;
  dupReason: string | null;
  /** Default decision: accept new lines, skip both dup kinds. */
  defaultAccept: boolean;
}

const NAME_THRESHOLD = 0.85;
const AMOUNT_TOLERANCE = 0.01; // 1%

function bigrams(s: string): Map<string, number> {
  const t = s.toLowerCase().replace(/\s+/g, ' ').trim();
  const m = new Map<string, number>();
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/** Dice coefficient over character bigrams — 1 = identical, 0 = nothing shared. */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.toLowerCase().trim() === b.toLowerCase().trim()) return 1;
  const A = bigrams(a), B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let overlap = 0;
  for (const [g, ca] of A) {
    const cb = B.get(g);
    if (cb) overlap += Math.min(ca, cb);
  }
  const total = [...A.values()].reduce((s, n) => s + n, 0) + [...B.values()].reduce((s, n) => s + n, 0);
  return (2 * overlap) / total;
}

function amountsClose(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale <= AMOUNT_TOLERANCE;
}

/** The comparable amount for a proposal (actual if set, else estimate). */
function proposalAmount(p: ParsedProposal): number {
  return p.value.actual_cost || p.value.proposed_cost || 0;
}

export function classifyProposals(proposals: ParsedProposal[], existing: ExistingLine[]): ClassifiedProposal[] {
  return proposals.map((proposal) => {
    const pAmt = proposalAmount(proposal);
    const pSection = proposal.value.section.toLowerCase().trim();
    // Best name match within the same section.
    let best: { line: ExistingLine; sim: number } | null = null;
    for (const line of existing) {
      if (line.section.toLowerCase().trim() !== pSection) continue;
      const sim = nameSimilarity(proposal.value.label, line.label);
      if (sim >= NAME_THRESHOLD && (!best || sim > best.sim)) best = { line, sim };
    }
    if (!best) {
      return { proposal, kind: 'new', dupOf: null, dupReason: null, defaultAccept: true };
    }
    if (amountsClose(pAmt, best.line.amount)) {
      return {
        proposal,
        kind: 'exact_dup',
        dupOf: best.line.id,
        dupReason: `Possible duplicate of "${best.line.label}" — same amount`,
        defaultAccept: false,
      };
    }
    return {
      proposal,
      kind: 'value_change',
      dupOf: best.line.id,
      dupReason: `Matches "${best.line.label}" but amount differs (${best.line.amount} → ${pAmt})`,
      defaultAccept: false,
    };
  });
}
