/* ============================================
   LOWPASS — Budget section kinds (Phase 3, pure / server+client safe)

   A budget_section is either a plain `custom` section (user-named, holds
   editable line items) or a LOCKED FORMULA section whose rows are computed
   read-only from the P&L (computeBudgetPnl) — the % lives in Settings, not
   in a cell.

   This module is a plain .ts (NO 'use client') so the sections API
   (server) and the grid (client) share the same vocabulary — pitfall #2.
   ============================================ */

export type BudgetSectionKind =
  | 'custom'
  | 'commission'
  | 'insurance'
  | 'contingency'
  | 'cogs';

export const BUDGET_SECTION_KINDS: readonly BudgetSectionKind[] = [
  'custom',
  'commission',
  'insurance',
  'contingency',
  'cogs',
];

/** The kinds whose rows are computed + read-only (one of each per tour). */
export const FORMULA_SECTION_KINDS: readonly BudgetSectionKind[] = [
  'commission',
  'insurance',
  'contingency',
  'cogs',
];

export function isFormulaSectionKind(
  kind: string | null | undefined,
): kind is 'commission' | 'insurance' | 'contingency' | 'cogs' {
  return (
    kind === 'commission' ||
    kind === 'insurance' ||
    kind === 'contingency' ||
    kind === 'cogs'
  );
}

export function normalizeSectionKind(
  kind: string | null | undefined,
): BudgetSectionKind {
  return BUDGET_SECTION_KINDS.includes(kind as BudgetSectionKind)
    ? (kind as BudgetSectionKind)
    : 'custom';
}

/** Default display name when a formula section is created from the picker. */
export const SECTION_KIND_NAME: Record<BudgetSectionKind, string> = {
  custom: 'New section',
  commission: 'Commissions',
  insurance: 'Insurance',
  contingency: 'Contingency',
  cogs: 'Merch COGS',
};

/** Picker labels (the "+ Add section" menu). */
export const SECTION_KIND_PICKER_LABEL: Record<BudgetSectionKind, string> = {
  custom: 'Custom section',
  commission: 'Commissions (formula)',
  insurance: 'Insurance (formula)',
  contingency: 'Contingency (formula)',
  cogs: 'Merch COGS (formula)',
};

/** Human label for an overhead/commission basis, for the read-only hint. */
export const SECTION_BASIS_LABEL: Record<string, string> = {
  income_gross: 'gross income',
  expenses_total: 'total expenses',
  expenses_pre_contingency: 'expenses before contingency',
  gross: 'gross income',
  net: 'net (gross − pre-commission expenses)',
  gross_merch: 'merch income',
  net_merch: 'merch net of COGS',
  gross_minus_tax: 'pre-tax income',
};

export function basisLabel(basis: string | null | undefined): string {
  if (!basis) return '';
  return SECTION_BASIS_LABEL[basis] ?? basis;
}
