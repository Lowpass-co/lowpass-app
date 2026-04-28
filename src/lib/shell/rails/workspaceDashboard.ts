import { ClipboardList, LayoutGrid, LineChart, ListMusic } from 'lucide-react';
import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DashboardRail = Extract<LeftRailVariant, { kind: 'dashboard' }>;

/** Post-login / workspace dashboard: tour selection + advance scope is elsewhere (TopBar + context). */
export function getWorkspaceDashboardRail(artistQuery: string): DashboardRail {
  const q = artistQuery;
  return {
    kind: 'dashboard',
    tourId: 'workspace',
    structure: [
      { label: 'Dashboard', href: `/dashboard${q}`, icon: LayoutGrid },
      { label: 'All tours', href: `/tours${q}`, icon: ListMusic },
      { label: 'Advance', href: `/advance${q}`, icon: ClipboardList },
      { label: 'Performance', href: `/performance${q}`, icon: LineChart },
    ],
  };
}
