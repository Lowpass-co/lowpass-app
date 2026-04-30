import type { LeftRailVariant } from '@/components/shell/LeftRail';

type SpreadsheetRail = Extract<LeftRailVariant, { kind: 'spreadsheet' }>;
import { BUDGET_TABS } from '@/_legacy/budget/budget-tabs';

/**
 * Left rail for Budget: tabs match BUDGET_TABS at /budget?tour_id=.
 */
export function getBudgetSheetSections(tourId: string, activeTab: string): SpreadsheetRail {
  const q = (tab: string) => `/budget?tour_id=${encodeURIComponent(tourId)}&tab=${encodeURIComponent(tab)}`;
  return {
    kind: 'spreadsheet',
    activeId: BUDGET_TABS.some((t) => t.id === activeTab) ? activeTab : 'summary',
    sections: BUDGET_TABS.map((t) => ({
      id: t.id,
      label: t.label,
      href: q(t.id),
    })),
  };
}
