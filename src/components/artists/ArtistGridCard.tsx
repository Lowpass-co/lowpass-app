/* ============================================
   LOWPASS — Sprint 7 §5 — <ArtistGridCard>
                Sprint 8.4 §3 — added ⋮ overflow menu

   Card in the workspace landing's artist grid. 280×320 with
   banner half on top + content half on bottom; 88px logo
   half-extends from the banner into the content area.

   Click anywhere on the card → navigates to /artists/[id].
   Hover lift via .lp-artist-grid-card class in globals.css.

   Sprint 8.4 §3 — top-right ⋮ overflow menu (becomes visible
   on hover via the .lp-artist-grid-card-menu class) opens a
   small popover with "Delete artist…". Refactored from a single
   <Link> to a <div role="link"> with an inner clickable
   surface so the menu button can live as a sibling — HTML
   doesn't allow nested <button>s inside <a>s.
   ============================================ */

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Trash2 } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import { ArtistInitialsChip } from './ArtistInitialsChip';
import { ArtistDeleteConfirmationModal } from './ArtistDeleteConfirmationModal';
import { TourFingerprint } from '@/components/tour/TourFingerprint';
import type { WorkspaceLandingArtist } from '@/server/workspace/getWorkspaceLandingData';

function formatNextDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  // D-preflight #2 — "ddd d MMM" (e.g. "Tue 9 Sep"), title case, not SHOUTY caps.
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

function shortenVenue(s: string): string {
  return s.length > 22 ? `${s.slice(0, 22)}…` : s;
}

export function ArtistGridCard({
  artist,
}: {
  artist: WorkspaceLandingArtist;
}) {
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const navigate = () => router.push(`/artists/${artist.id}`);

  return (
    <>
      <div
        className="lp-artist-grid-card lp-artist-grid-card-hover relative"
        style={{
          background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-lg)',
          overflow: 'hidden',
          // Oct 2026 — was a fixed 320px, which squashed the status line until
          // its letters lost their tails ("runnina"). Fill the grid row instead
          // (cards in a row stay equal) and let content set the minimum.
          height: '100%',
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Click target — covers the whole card via absolute fill,
            sits BELOW the menu button via z-index. The menu's
            stopPropagation prevents the card's navigate from firing
            when the menu icon is clicked. */}
        <button
          type="button"
          onClick={navigate}
          aria-label={`Open ${artist.name}`}
          className="absolute inset-0 cursor-pointer"
          style={{
            zIndex: 1,
            background: 'transparent',
            border: 'none',
            padding: 0,
          }}
        />

        {/* Banner — top half. Spotify image cover or gradient
            fallback. */}
        <div
          style={{
            height: 160,
            flexShrink: 0,
            background: artist.bannerUrl
              ? `url(${artist.bannerUrl}) center / cover no-repeat`
              : artist.bannerGradient,
            position: 'relative',
            pointerEvents: 'none',
          }}
        >
          {artist.bannerUrl ? (
            <div
              aria-hidden
              className="absolute inset-0"
              style={{
                backdropFilter: 'brightness(0.9)',
                WebkitBackdropFilter: 'brightness(0.9)',
              }}
            />
          ) : null}
        </div>

        {/* ⋮ overflow menu — top-right, above the click target. */}
        <div
          className="absolute"
          style={{
            top: 'var(--lp-space-2)',
            right: 'var(--lp-space-2)',
            zIndex: 2,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <ContextMenu
            items={[
              {
                label: 'Delete artist…',
                icon: Trash2,
                variant: 'danger',
                onClick: () => setDeleteOpen(true),
              },
            ]}
            align="right"
          />
        </div>

        {/* Logo overlay — half-extends from banner into content. */}
        <div
          className="absolute"
          style={{
            left: 'var(--lp-space-3)',
            top: 160 - 44,
            width: 88,
            height: 88,
            borderRadius: 'var(--lp-radius-full)',
            border: '2px solid var(--lp-bg)',
            boxShadow: 'var(--lp-shadow-sm)',
            overflow: 'hidden',
            background: 'var(--lp-bg-deep)',
            pointerEvents: 'none',
          }}
        >
          {artist.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={artist.logoUrl}
              alt=""
              width={88}
              height={88}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: 'block',
              }}
            />
          ) : (
            <ArtistInitialsChip name={artist.name} size={88} fontSize={28} />
          )}
        </div>

        {/* Content — bottom half. Top padding accommodates the
            half-extending logo. */}
        <div
          className="flex flex-col"
          style={{
            padding: '52px var(--lp-space-3) var(--lp-space-3)',
            gap: 'var(--lp-space-2)',
            pointerEvents: 'none',
            flex: '1 0 auto',
          }}
        >
          <div
            className="lp-label-caps truncate"
            style={{
              color: 'var(--lp-text)',
              fontWeight: 'var(--lp-weight-medium)',
              letterSpacing: 'var(--lp-tracking-caps)',
              fontSize: 'var(--lp-text-base)',
              textTransform: 'uppercase',
            }}
          >
            {artist.name}
          </div>

          {/* Card-scale strip of the featured tour: one even row of days, past
              dimmed, a marker on today, start/end dates under it. The next show
              is in the footer, so the strip doesn't mark it. pointerEvents
              re-enabled (parent content is inert) + above the click target. */}
          {artist.fingerprint.length > 0 ? (
            <div style={{ pointerEvents: 'auto', position: 'relative', zIndex: 2, width: '100%' }}>
              <TourFingerprint
                days={artist.fingerprint}
                size="card"
                fill
                ariaLabel={`${artist.name}: tour days`}
                className="w-full"
              />
            </div>
          ) : null}

          {/* Derived status line (§8) — "Rehearsals in 65 days" / "First show in
              N days" / "Tour running · day X of Y". Shares tourStatus with the
              Needs-you queue, so it never disagrees with the footer. Falls back to
              the active/months summary only when there's no featured tour. */}
          {/* One status line; line-height leaves room for descenders, and it
              never shrinks (the old fixed-height card squeezed it). */}
          <div
            className="truncate"
            style={{
              flexShrink: 0,
              lineHeight: 1.45,
              fontSize: 'var(--lp-text-xs)',
              fontWeight: artist.statusLine ? 'var(--lp-weight-medium)' : undefined,
              color: artist.statusLine ? 'var(--lp-text-secondary)' : 'var(--lp-text-tertiary)',
            }}
          >
            {artist.statusLine ?? (artist.action.label === 'Plan a tour' ? 'No tours yet' : 'No dates booked yet')}
          </div>

          {/* Standardized footer (§8): left = Next: <date> · <city> (or Nothing
              booked), right = derived action verb — same shape on every card. */}
          <div
            className="mt-auto flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)', paddingTop: 'var(--lp-space-1)' }}
          >
            <span
              className="min-w-0 truncate"
              style={{
                lineHeight: 1.45,
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              {artist.nextShow ? (
                <>
                  Next show{' '}
                  {/* same face + size as the label (the mono date looked oversized) */}
                  <span className="tabular-nums" style={{ color: 'var(--lp-text-secondary)', fontWeight: 'var(--lp-weight-medium)' }}>
                    {formatNextDate(artist.nextShow.date)}
                  </span>
                  {artist.nextShow.city ? ` · ${shortenVenue(artist.nextShow.city)}` : ''}
                </>
              ) : artist.statusLine ? (
                'Nothing booked'
              ) : null /* the status line already says "No tours yet" / "No dates booked yet" */}
            </span>
            <span
              className="inline-flex shrink-0 items-center"
              style={{
                gap: 4,
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--color-lp-orange)',
                whiteSpace: 'nowrap',
              }}
            >
              {artist.action.label}
              <ArrowRight size={12} aria-hidden />
            </span>
          </div>
        </div>
      </div>

      {/* Delete confirmation modal — local to this card. */}
      <ArtistDeleteConfirmationModal
        open={deleteOpen}
        artistId={artist.id}
        artistName={artist.name}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => {
          // After deletion, refresh the workspace landing so the
          // grid drops this card. router.refresh() re-fetches the
          // server-rendered data on the current page.
          router.refresh();
        }}
      />
    </>
  );
}
