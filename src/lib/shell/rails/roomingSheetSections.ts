import type { LeftRailVariant } from '@/components/shell/LeftRail';

type SpreadsheetRail = Extract<LeftRailVariant, { kind: 'spreadsheet' }>;

export function getRoomingSheetSections(tourId: string): SpreadsheetRail {
  return {
    kind: 'spreadsheet',
    activeId: 'rooming',
    sections: [
      { id: 'rooming', label: 'Rooming', href: `/tours/${tourId}/rooming` },
    ],
  };
}
