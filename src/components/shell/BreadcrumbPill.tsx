'use client';

/* ============================================
   LOWPASS — <BreadcrumbPill> (Sprint 10 §1.3)

   Scope path pill rendered in <UnifiedTopBar>'s left cluster.
   Composition:

     [● avatar (dropdown trigger)]   {artist.name} › {tour.name}
                ↓                          ↓             ↓
          ArtistTourSwitcher           Link to        Link to
          (avatar-only variant)        /artists/[id]  /operations/[tourId]

   Three render shapes driven by scope:

     - workspace : returns null (no breadcrumb at workspace scope)
     - artist    : avatar trigger + artist segment (link no-op,
                   already at /artists/[id])
     - tour      : avatar trigger + artist segment (link to
                   /artists/[id]) + › separator + tour segment
                   (link to /operations/[tourId])

   The avatar trigger is the existing <ArtistTourSwitcher> with
   triggerVariant='avatar-only', mounted via the existing
   <ArtistTourSwitcherClientWrapper>. Same dropdown / state /
   keyboard interactions as the chip-style trigger; just a
   different visual.
   ============================================ */

import Link from 'next/link';
import { ArtistTourSwitcherClientWrapper } from '@/components/shell-v2/ArtistTourSwitcherClientWrapper';
import { toTitleCase } from '@/lib/text/toTitleCase';
import type { ScopeInfo } from '@/lib/shell/scope';

export type ArtistMin = {
  id: string;
  name: string;
  branding: unknown;
  spotify_image_url?: string | null;
};

interface BreadcrumbPillProps {
  scope: ScopeInfo;
  /** Layout-fetched artist row that anchors the avatar dropdown
   *  + the artist segment label. Null when the scope is
   *  workspace OR when the layout couldn't resolve the
   *  artist. */
  artist: { id: string; name: string } | null;
  /** Tour row when at tour scope. Null elsewhere. */
  tour: { id: string; name: string } | null;
  /** Pre-fetched artist list for the avatar dropdown's first
   *  paint. Same shape as the existing ATSCW prop. */
  initialArtists: ArtistMin[];
}

const SEGMENT_DIVIDER = '›';

export function BreadcrumbPill({
  scope,
  artist,
  tour,
  initialArtists,
}: BreadcrumbPillProps) {
  if (scope.level === 'workspace') return null;

  return (
    <span
      className="inline-flex min-w-0 items-center"
      style={{
        gap: 'var(--lp-space-2)',
        padding: '4px 10px 4px 4px',
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 999,
      }}
    >
      {/* Avatar = dropdown trigger. Mounting ATSCW with
          avatar-only keeps all the existing artist+tour
          switcher state, fetch, dropdown chrome — only the
          trigger visual changes. */}
      <ArtistTourSwitcherClientWrapper
        triggerVariant="avatar-only"
        initialArtists={initialArtists}
        initialTours={null}
        initialArtistId={artist?.id ?? null}
      />

      {/* Artist segment — Link to /artists/[id] when at tour
          scope (so user can drill back up); plain text when
          already at artist scope (no-op self-link is worse
          than a static label). */}
      {artist ? (
        scope.level === 'tour' ? (
          <Link
            href={`/artists/${artist.id}`}
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-medium)',
              color: 'var(--lp-text)',
              textDecoration: 'none',
              maxWidth: 200,
            }}
          >
            {toTitleCase(artist.name)}
          </Link>
        ) : (
          <span
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
              maxWidth: 200,
            }}
          >
            {toTitleCase(artist.name)}
          </span>
        )
      ) : null}

      {/* Tour segment — only at tour scope. Active (last)
          segment renders bolder per spec. Click → tour
          summary. */}
      {scope.level === 'tour' && tour ? (
        <>
          <span
            aria-hidden
            style={{
              color: 'var(--lp-text-tertiary)',
              flexShrink: 0,
            }}
          >
            {SEGMENT_DIVIDER}
          </span>
          <Link
            href={`/operations/${tour.id}`}
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
              textDecoration: 'none',
              maxWidth: 200,
            }}
          >
            {tour.name}
          </Link>
        </>
      ) : null}
    </span>
  );
}
