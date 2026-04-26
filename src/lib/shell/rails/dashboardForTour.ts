import { Building2, Calendar, LayoutGrid, Users } from 'lucide-react';
import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DashboardRail = Extract<LeftRailVariant, { kind: 'dashboard' }>;

/** Tour hub links — mirrors legacy sidebar "tour" destinations. */
export function getDashboardLeftRail(tourId: string): DashboardRail {
  return {
    kind: 'dashboard',
    tourId,
    structure: [
      { label: 'Overview', href: `/tours/${tourId}`, icon: LayoutGrid },
      { label: 'Advance', href: `/tours/${tourId}/advance`, icon: Calendar },
      { label: 'Budget', href: `/budget?tour_id=${encodeURIComponent(tourId)}&tab=summary`, icon: Building2 },
      { label: 'Personnel', href: `/tours/${tourId}/personnel`, icon: Users },
    ],
  };
}
