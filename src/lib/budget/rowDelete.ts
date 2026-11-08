/* ============================================
   LOWPASS — which budget rows a delete may remove (Nov 2026)

   The grid hands over the highlighted rows; this decides, before anything is
   sent:
     manual       may go
     auto         automatic lines (Payroll, Hotels, Travel, Gear) — kept,
                  because reconcile would only write them back; named so the
                  toast can say where to change them
     withActuals  manual rows with spending recorded — deleting them also
                  deletes their transactions and documents (FK cascade), so
                  those need a yes first
   The server applies the same automatic-line rule (isDerivedLine) and refuses
   regardless; this is so the screen says it before the request.
   ============================================ */

import { isDerivedLine, perLineSourceLabel } from '@/lib/grid/budgetAdapter';
import type { BudgetLineItem } from '@/types';

export interface RowDeletePlan {
  manual: string[];
  auto: Array<{ id: string; source: string }>;
  /** ids in `manual` with an actual recorded. Counted, never summed — rows
   *  can be in different currencies. */
  withActuals: string[];
}

export function planRowDelete(uids: string[], linesById: Map<string, BudgetLineItem>): RowDeletePlan {
  const plan: RowDeletePlan = { manual: [], auto: [], withActuals: [] };
  for (const id of new Set(uids)) {
    const line = linesById.get(id);
    if (!line) continue; // not a saved line (or already gone)
    if (isDerivedLine(line)) {
      plan.auto.push({ id, source: perLineSourceLabel(line) });
      continue;
    }
    plan.manual.push(id);
    if (Number(line.actual_cost) || 0) plan.withActuals.push(id);
  }
  return plan;
}

/** "Payroll and Hotels & rooming" — the pages the kept rows come from, in the
 *  sidebar's own words. */
export function autoSourcesText(auto: RowDeletePlan['auto'], pageFor: (source: string) => string): string {
  const pages = [...new Set(auto.map((a) => pageFor(a.source)))];
  return pages.length <= 1 ? (pages[0] ?? '') : `${pages.slice(0, -1).join(', ')} and ${pages[pages.length - 1]}`;
}

/** The toast after rows are staged for deletion. */
export function deletedToastText(deleted: number, kept: number): string {
  const d = `Deleted ${deleted} ${deleted === 1 ? 'row' : 'rows'}`;
  return kept ? `${d} · kept ${kept} automatic` : d;
}
