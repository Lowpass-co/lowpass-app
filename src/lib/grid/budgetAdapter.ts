/* ============================================
   LOWPASS — Budget (Expenses) ↔ canonical <Grid> adapter (Phase 3, Stage B)

   PURE mapping between the live budget tables and the grid's Section[]/Row
   contract. No I/O, no React, no DOM — so it's unit-testable both directions
   (see budgetAdapter.test.ts). Decisions baked in (PHASE3_BUDGET_MAP.md):
     • Expenses grid = real budget_line_items + DERIVED sections only.
       Formula sections (commission/insurance/contingency/cogs) are computed
       elsewhere (Summary tab) and are EXCLUDED here (decision 4).
     • Derived lines (Payroll/Rooming) → grid Section.kind='derived' + source;
       the grid locks BOTH est + act on them (decision 2).
     • No `vendor` column — vendor lives on transactions (decision 3).
     • Status stays the DB set (decision 1) — the column/slide options are
       configured by the caller, not here.
   Type-only imports (erased at runtime) keep this file dependency-free.
   ============================================ */

import type { Section, Row } from '@/components/grid/types';
import type { BudgetLineItem, BudgetSection } from '@/types';

/** Section kinds that are computed P&L formulas, not line-item data. Excluded
 *  from the Expenses grid (rendered on the Summary tab instead). */
export const FORMULA_SECTION_KINDS = ['commission', 'insurance', 'contingency', 'cogs'] as const;
export function isFormulaSectionKind(kind: string | null | undefined): boolean {
  return !!kind && (FORMULA_SECTION_KINDS as readonly string[]).includes(kind);
}

/** Derived source_entity_type values reconcile writes onto budget lines. */
const DERIVED_SOURCE_TYPES = new Set(['hotel_booking', 'payroll', 'payroll_per_diem']);

/** A budget line is DERIVED (owned by Operations — Payroll/Rooming/etc., est+act
 *  regenerated each reconcile) if it carries a derived source_entity_type or a
 *  canonical FK. Mirrors `isUx14DerivedBudgetLine` (src/lib/budget/
 *  budgetUx14Derived.ts) — kept inline so this stays a pure, testable module. */
export function isDerivedLine(l: BudgetLineItem): boolean {
  if (l.source_entity_type && DERIVED_SOURCE_TYPES.has(l.source_entity_type)) return true;
  return !!(l.hotel_id || l.room_id || l.flight_id || l.gear_id || l.tour_gear_id);
}

/** G1-B #14 — the source SURFACE a single derived line came from, for the
 *  grid's per-row provenance chip. "Operations" is retired (that menu no longer
 *  exists); label by the real surface so the chip points the TM at the right
 *  editor. Per-diem is split out from payroll here (payroll is Salary). */
export function perLineSourceLabel(l: BudgetLineItem): string {
  if (l.source_entity_type === 'payroll_per_diem') return 'Per Diem';
  if (l.source_entity_type === 'payroll') return 'Payroll';
  if (l.source_entity_type === 'hotel_booking' || l.hotel_id || l.room_id) return 'Rooming';
  if (l.flight_id) return 'Travel';
  if (l.gear_id || l.tour_gear_id) return 'Gear';
  return 'Operations';
}

/** Which Operations module owns a derived section, for the section-level pill.
 *  Uses the per-line labels; a payroll section that also carries per-diem lines
 *  still reads "Payroll" (the dominant surface) at the section header. */
export function derivedSourceLabel(lines: BudgetLineItem[]): string {
  for (const l of lines) {
    if (l.source_entity_type === 'payroll' || l.source_entity_type === 'payroll_per_diem') return 'Payroll';
  }
  for (const l of lines) {
    if (l.source_entity_type === 'hotel_booking' || l.hotel_id || l.room_id) return 'Rooming';
  }
  for (const l of lines) {
    if (l.flight_id) return 'Travel';
    if (l.gear_id || l.tour_gear_id) return 'Gear';
  }
  return 'Operations';
}

/** Effective actual: the column the server already keeps in sync with the
 *  transaction sum (unless the user set an override). We display actual_cost. */
function effectiveActual(l: BudgetLineItem): number {
  return Number(l.actual_cost) || 0;
}

/** One budget line → a grid Row. `cur` falls back to the tour currency so a
 *  same-currency line shows no conversion; a foreign one renders red + ≈. */
export function lineToRow(
  l: BudgetLineItem,
  tourCurrency: string,
  dayTypeByRouting?: Record<string, string>,
): Row {
  const derived = isDerivedLine(l);
  return {
    _uid: l.id,
    item: l.label ?? '',
    est: Number(l.proposed_cost) || 0,
    act: effectiveActual(l),
    status: l.status ?? 'draft',
    cur: (l.currency || tourCurrency || 'USD').toUpperCase(),
    notes: l.notes ?? '',
    // Stage-3 parity (display only): day-type pill value (the line's routing
    // day-type) + phase grouping key (line's phase_tag). No calculation.
    dayType: (l.routing_id && dayTypeByRouting?.[l.routing_id]) || '',
    phase: l.phase_tag ?? '',
    // Step 5 — server-supplied counts for the 📎 receipts cell badge.
    txnCount: l.transaction_count ?? 0,
    docCount: l.attachment_count ?? 0,
    // carried for the UI/persistence layer (not rendered as columns):
    _lineId: l.id,
    _derived: derived,
    // #14 — per-row provenance surface (Payroll / Per Diem / Rooming / Travel /
    // Gear), so the grid's derived chip labels each line by its real source even
    // in a mixed section (where the section-level `source` is undefined).
    _derivedSource: derived ? perLineSourceLabel(l) : undefined,
    _sectionId: l.section_id ?? null,
    _txnCount: l.transaction_count ?? 0,
    _actualOverride: !!l.actual_cost_override,
  };
}

export interface BudgetGridOptions {
  tourCurrency: string;
  /** label for the bucket holding lines with no section_id. */
  ungroupedName?: string;
  /** Stage-3 parity — routing_id → day_type, for the day-type pill (display). */
  dayTypeByRouting?: Record<string, string>;
}

/** Live budget rows → grid Section[]. Formula sections are dropped; derived
 *  sections are classified + sourced; lines keep DB order. */
export function budgetToGridSections(
  lines: BudgetLineItem[],
  sections: BudgetSection[],
  opts: BudgetGridOptions,
): Section[] {
  const tourCurrency = (opts.tourCurrency || 'USD').toUpperCase();
  const ungroupedName = opts.ungroupedName ?? 'Ungrouped';

  // Visible sections in sort order, formula kinds excluded.
  const visibleSections = [...sections]
    .filter((s) => !isFormulaSectionKind(s.kind))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  // Group lines by section_id (stable: by sort_order then order_index).
  const bySection = new Map<string, BudgetLineItem[]>();
  const ungrouped: BudgetLineItem[] = [];
  for (const l of lines) {
    if (l.section_id) {
      const arr = bySection.get(l.section_id) ?? [];
      arr.push(l);
      bySection.set(l.section_id, arr);
    } else {
      ungrouped.push(l);
    }
  }
  const sortLines = (arr: BudgetLineItem[]) =>
    [...arr].sort(
      (a, b) => (a.sort_order ?? a.order_index ?? 0) - (b.sort_order ?? b.order_index ?? 0),
    );

  const out: Section[] = [];
  for (const s of visibleSections) {
    const secLines = sortLines(bySection.get(s.id) ?? []);
    const allDerived = secLines.length > 0 && secLines.every(isDerivedLine);
    out.push({
      _uid: s.id,
      name: s.name,
      kind: allDerived ? 'derived' : 'normal',
      source: allDerived ? derivedSourceLabel(secLines) : undefined,
      rows: secLines.map((l) => lineToRow(l, tourCurrency, opts.dayTypeByRouting)),
    });
  }

  if (ungrouped.length > 0) {
    out.push({
      _uid: 'ungrouped',
      name: ungroupedName,
      kind: 'normal',
      rows: sortLines(ungrouped).map((l) => lineToRow(l, tourCurrency, opts.dayTypeByRouting)),
    });
  }
  return out;
}

/* ---- grid edit → DB write ---------------------------------------- */

/** Map a grid Row field id → the budget_line_items column it persists to.
 *  Returns null for fields that don't persist (idx/variance/receipts/etc.). */
export function gridFieldToColumn(field: string): string | null {
  switch (field) {
    case 'item':
      return 'label';
    case 'est':
      return 'proposed_cost';
    case 'act':
      return 'actual_cost';
    case 'status':
      return 'status';
    case 'cur':
      return 'currency';
    case 'notes':
      return 'notes';
    default:
      return null;
  }
}

/** A single grid cell edit → the PATCH body for /api/budget/line-items.
 *  Editing `act` directly sets actual_cost_override so the server's
 *  transaction-sum auto-sync doesn't immediately overwrite it (decision 6 /
 *  syncActualCostIfNoOverride). Returns null when the field doesn't persist. */
export function gridEditToPatch(field: string, value: unknown): Record<string, unknown> | null {
  const col = gridFieldToColumn(field);
  if (!col) return null;
  const patch: Record<string, unknown> = { [col]: value };
  if (col === 'actual_cost') patch.actual_cost_override = true;
  return patch;
}
