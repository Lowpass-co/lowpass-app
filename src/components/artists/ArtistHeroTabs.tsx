/* ============================================================
   LOWPASS — <ArtistHeroTabs> (Design pass §9; Nov 2026 nav audit)

   The tab row merged into the artist hero: Tours / Library.

   - Tours   → /artists/[id]            (the tour list — this page)
   - Library → /artists/[id]/production (hub over the artist's own riders,
               channel lists, stage plots and files — the masters each tour
               starts from). The URL keeps its old name; the word is
               "Library" because "Production" now means the TOUR's riders /
               plots / gear in the tour menu, and one word should mean one
               thing.

   The locked "Business" tab is gone (Nov 2026): it had no page behind it for
   anyone, and the menu has no disabled items.
   ============================================================ */

import Link from 'next/link';

export type ArtistTab = 'tours' | 'production';

const TABS: ReadonlyArray<{ key: ArtistTab; label: string }> = [
  { key: 'tours', label: 'Tours' },
  { key: 'production', label: 'Library' },
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
