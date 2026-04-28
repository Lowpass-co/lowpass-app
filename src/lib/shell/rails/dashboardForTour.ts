import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  Folder,
  LayoutGrid,
  Map,
  Speaker,
  Users,
} from 'lucide-react';
import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DashboardRail = Extract<LeftRailVariant, { kind: 'dashboard' }>;

/**
 * Tour hub links — UX16 dashboard archetype.
 * Order mirrors the prompt's expected nav: Overview / Routing / Advance /
 * Budget / Personnel / Rooming / Files / Channel List / Rider Packs.
 */
export function getDashboardLeftRail(tourId: string): DashboardRail {
  return {
    kind: 'dashboard',
    tourId,
    structure: [
      { label: 'Overview', href: `/tours/${tourId}`, icon: LayoutGrid },
      { label: 'Routing', href: `/tours/${tourId}/routing`, icon: Map },
      { label: 'Advance', href: `/tours/${tourId}/advance`, icon: Calendar },
      { label: 'Budget', href: `/tours/${tourId}/budget`, icon: Building2 },
      { label: 'Personnel', href: `/tours/${tourId}/personnel`, icon: Users },
      { label: 'Rooming', href: `/tours/${tourId}/rooming`, icon: ClipboardList },
      { label: 'Files', href: `/tours/${tourId}/files`, icon: Folder },
      { label: 'Channel List', href: `/tours/${tourId}/channel-list`, icon: Speaker },
      { label: 'Rider Packs', href: `/tours/${tourId}/rider-packs`, icon: BookOpen },
    ],
  };
}
