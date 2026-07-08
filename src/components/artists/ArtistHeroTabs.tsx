/* ============================================================
   LOWPASS — <ArtistHeroTabs> (Design pass §9 · VIS-AR-01 / VIS-AR-04)

   The tab row merged into the artist hero: Tours / Production / Business.

   - Tours     → /artists/[id]            (the tour list — this page)
   - Production → /artists/[id]/production (hub over the existing library
                  surfaces: riders / channel-lists / stage-plots / financials /
                  files — those routes are untouched, this just groups them).
   - Business  → LOCKED (VIS-AR-04): a lock icon + self-explaining
                  "managers only" tooltip. Not yet a navigable surface, so it
                  renders as a disabled tab, not a link.

   Server component — active tab is a prop; the tooltip is CSS-hover only, no
   client JS. Wrapped in .lp-view-tier so view-tier hue scoping applies.
   ============================================================ */

import Link from 'next/link';
import { Lock } from 'lucide-react';

export type ArtistTab = 'tours' | 'production' | 'business';

const TABS: ReadonlyArray<{ key: ArtistTab; label: string }> = [
  { key: 'tours', label: 'Tours' },
  { key: 'production', label: 'Production' },
  { key: 'business', label: 'Business' },
];

export function ArtistHeroTabs({
  artistId,
  active,
}: {
  artistId: string;
  active: ArtistTab;
}) {
  const hrefFor = (key: ArtistTab): string =>
    key === 'tours' ? `/artists/${artistId}` : `/artists/${artistId}/${key}`;

  return (
    <nav
      className="lp-view-tier flex items-stretch gap-1"
      aria-label="Artist sections"
      style={{
        borderBottom: '1px solid var(--lp-border-subtle)',
        padding: '0 var(--lp-space-6)',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        // Business is manager-gated → rendered as a locked, non-navigating tab.
        if (tab.key === 'business') {
          return (
            <span
              key={tab.key}
              className="group relative inline-flex items-center gap-1.5"
              style={{
                padding: 'var(--lp-space-3) var(--lp-space-1)',
                marginBottom: -1,
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-medium)',
                color: 'var(--lp-text-tertiary)',
                cursor: 'default',
              }}
              tabIndex={0}
              role="button"
              aria-disabled="true"
              aria-label="Business — visible to managers only"
              title="Visible to managers only"
            >
              {tab.label}
              <Lock size={13} aria-hidden style={{ opacity: 0.8 }} />
              {/* self-explaining hover/focus tooltip */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-1/2 top-full z-10 -translate-x-1/2 whitespace-nowrap opacity-0 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
                style={{
                  marginTop: 'var(--lp-space-1)',
                  padding: 'var(--lp-space-1) var(--lp-space-2)',
                  borderRadius: 'var(--lp-radius-sm)',
                  border: '1px solid var(--lp-border-strong)',
                  background: 'var(--lp-panel)',
                  color: 'var(--lp-text-secondary)',
                  fontSize: 'var(--lp-text-2xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  boxShadow: 'var(--lp-shadow-md)',
                }}
              >
                Visible to managers only
              </span>
            </span>
          );
        }
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            aria-current={isActive ? 'page' : undefined}
            className="btn-transition inline-flex items-center"
            style={{
              padding: 'var(--lp-space-3) var(--lp-space-1)',
              marginBottom: -1,
              fontSize: 'var(--lp-text-sm)',
              fontWeight: isActive
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: isActive ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
              borderBottom: `2px solid ${
                isActive ? 'var(--color-lp-orange)' : 'transparent'
              }`,
              textDecoration: 'none',
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
