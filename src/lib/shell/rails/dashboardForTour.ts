import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DashboardRail = Extract<LeftRailVariant, { kind: 'dashboard' }>;

/**
 * Tour hub links — UX16 dashboard archetype.
 * Order mirrors the prompt's expected nav: Overview / Routing / Advance /
 * Budget / Personnel / Rooming / Files / Channel List / Rider Packs.
 *
 * Icon values are string keys looked up by <LeftRail> via rail-icons.ts.
 * Don't pass lucide component references here — they don't survive the
 * server→client boundary serialisation.
 */
export function getDashboardLeftRail(tourId: string): DashboardRail {
  return {
    kind: 'dashboard',
    tourId,
    structure: [
      { label: 'Overview', href: `/tours/${tourId}`, icon: 'layout-grid' },
      { label: 'Routing', href: `/tours/${tourId}/routing`, icon: 'map' },
      { label: 'Advance', href: `/tours/${tourId}/advance`, icon: 'calendar' },
      { label: 'Budget', href: `/tours/${tourId}/budget`, icon: 'building' },
      { label: 'Personnel', href: `/tours/${tourId}/personnel`, icon: 'users' },
      { label: 'Rooming', href: `/tours/${tourId}/rooming`, icon: 'clipboard-list' },
      { label: 'Files', href: `/tours/${tourId}/files`, icon: 'folder' },
      { label: 'Channel List', href: `/tours/${tourId}/channel-list`, icon: 'speaker' },
      { label: 'Rider Packs', href: `/tours/${tourId}/rider-packs`, icon: 'book-open' },
    ],
  };
}
