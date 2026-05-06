/* ============================================
   LOWPASS — Sprint 7 §5 — <ArtistGridCard>

   Card in the workspace landing's artist grid. 280×320 with
   banner half on top + content half on bottom; 88px logo
   half-extends from the banner into the content area.

   Click anywhere on the card → navigates to /artists/[id].
   Hover lift via .lp-artist-grid-card class in globals.css.
   ============================================ */

import Link from 'next/link';
import { ArtistInitialsChip } from './ArtistInitialsChip';
import type { WorkspaceLandingArtist } from '@/server/workspace/getWorkspaceLandingData';

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

function formatNextDate(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

function shortenVenue(s: string): string {
  return s.length > 22 ? `${s.slice(0, 22)}…` : s;
}

export function ArtistGridCard({
  artist,
}: {
  artist: WorkspaceLandingArtist;
}) {
  return (
    <Link
      href={`/artists/${artist.id}`}
      className="lp-artist-grid-card relative block"
      style={{
        background: 'var(--lp-panel)',
        border: '1px solid var(--lp-border-strong)',
        borderRadius: 'var(--lp-radius-lg)',
        overflow: 'hidden',
        textDecoration: 'none',
        height: 320,
      }}
    >
      {/* Banner — top half. Spotify image cover or gradient
          fallback. */}
      <div
        style={{
          height: 160,
          background: artist.bannerUrl
            ? `url(${artist.bannerUrl}) center / cover no-repeat`
            : artist.bannerGradient,
          position: 'relative',
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
          gap: 'var(--lp-space-1)',
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
        <div
          style={{
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          <span className="lp-mono">{artist.activeTourCount}</span>{' '}
          active ·{' '}
          <span className="lp-mono">{artist.monthsUpcoming}</span>{' '}
          {artist.monthsUpcoming === 1 ? 'month' : 'months'} upcoming
        </div>
        {artist.nextShow ? (
          <div
            className="truncate"
            style={{
              fontSize: 'var(--lp-text-2xs)',
              fontWeight: 'var(--lp-weight-bold)',
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
              marginTop: 4,
            }}
          >
            Next: {formatNextDate(artist.nextShow.date)}
            {artist.nextShow.venue
              ? ` · ${shortenVenue(artist.nextShow.venue)}`
              : ''}
          </div>
        ) : null}
      </div>
    </Link>
  );
}
