import type { LeftRailVariant } from '@/components/shell/LeftRail';

type DashboardRail = Extract<LeftRailVariant, { kind: 'dashboard' }>;

/**
 * Post-login / workspace dashboard rail. Tour selection + advance scope is
 * elsewhere (TopBar + ArtistTourContext). Icon values are string keys per
 * rail-icons.ts (server→client serialisation can't carry component refs).
 */
export function getWorkspaceDashboardRail(artistQuery: string): DashboardRail {
  const q = artistQuery;
  return {
    kind: 'dashboard',
    tourId: 'workspace',
    // Phase 1 §D: /dashboard folded into / (artist picker / Home), and
    // /performance retired entirely (decision #5). Rail keeps Tours +
    // Advance until product migrations re-skin the workspace surfaces.
    structure: [
      { label: 'All tours', href: `/tours${q}`, icon: 'list-music' },
      { label: 'Advance', href: `/advance${q}`, icon: 'clipboard-list' },
    ],
  };
}
