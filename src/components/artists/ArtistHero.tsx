/* ============================================
   LOWPASS — Sprint 7 §4 — <ArtistHero>

   Banner + logo + identity strip for /artists/[id].

   Layout:
     ┌─ 240px hero banner (Spotify image cover, blurred + faded) ─┐
     │                                                            │
     │  [88px LOGO bottom-left, half-extends below banner]        │
     └────────────────────────────────────────────────────────────┘

     {Artist name 32px}                     [Edit profile]
     GENRE · LISTENERS · LINK STATUS

   Fallbacks:
   - banner: branding.banner_url → spotify_banner_url → live
     fetch (image640) → gradient seeded by artist name.
   - logo: branding.logo_url → spotify_image_url → live fetch
     (image320) → initials chip on var(--color-lp-orange).

   Server component. The image URLs are resolved upstream by the
   page (which awaits the Spotify fetch); the hero just renders.
   ============================================ */

import { ArtistInitialsChip } from './ArtistInitialsChip';
import { EditArtistButton } from './EditArtistButton';
import type { ArtistEditSlideOverArtist } from './ArtistEditSlideOver';

const FOLLOWER_THRESHOLD = 1000;

function abbreviateFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

interface ArtistHeroProps {
  artistId: string;
  artistName: string;
  /** Pre-resolved logo URL (~88px display). */
  logoUrl: string | null;
  /** Pre-resolved banner URL (~640px source). */
  bannerUrl: string | null;
  /** Deterministic gradient string when bannerUrl is null. */
  bannerGradient: string;
  /** True when artist has spotify_id (any source). Drives the
   *  "LINKED ON SPOTIFY" tag in the meta line. */
  spotifyLinked: boolean;
  /** Optional Spotify meta — when present, replaces the generic
   *  "Linked on Spotify" with genre + monthly listeners. */
  primaryGenre: string | null;
  monthlyListeners: number | null;
  /** Sprint 8.4 §2 — full artist row (lean projection) for the
   *  Edit profile slide-over. Passed through to <EditArtistButton>
   *  which mounts <ArtistEditSlideOver> with all current values. */
  editArtist: ArtistEditSlideOverArtist;
}

export function ArtistHero({
  artistId,
  artistName,
  logoUrl,
  bannerUrl,
  bannerGradient,
  spotifyLinked,
  primaryGenre,
  monthlyListeners,
  editArtist,
}: ArtistHeroProps) {
  // artistId param kept for future use (analytics/data-attrs);
  // EditArtistButton reads the id off editArtist.
  void artistId;
  // Build the meta line — dot-separated micro-labels.
  const metaParts: string[] = [];
  if (primaryGenre) metaParts.push(primaryGenre.toUpperCase());
  if (monthlyListeners != null && monthlyListeners >= FOLLOWER_THRESHOLD) {
    metaParts.push(`${abbreviateFollowers(monthlyListeners)} MONTHLY LISTENERS`);
  }
  metaParts.push(spotifyLinked ? 'LINKED ON SPOTIFY' : 'NOT LINKED');
  const metaLine = metaParts.join(' · ');

  return (
    <div>
      {/* Banner — 240px tall. background-image when URL resolved,
          gradient fallback otherwise. The blur softens busy
          Spotify cover crops; the gradient overlay fades the
          bottom into the page background. */}
      <div
        className="relative w-full"
        style={{
          height: 240,
          background: bannerUrl
            ? `url(${bannerUrl}) center / cover no-repeat`
            : bannerGradient,
        }}
      >
        {bannerUrl ? (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              // Sprint 8 §1 — bumped from blur(2px) brightness(0.85)
              // to blur(12px) brightness(0.7). Spotify images are
              // ~640px native; scaling to a 1400px-wide banner
              // pixelated noticeably with the lighter blur. 12px
              // masks the upscale; 0.7 brightness keeps the
              // overlay text readable.
              backdropFilter: 'blur(12px) brightness(0.7)',
              WebkitBackdropFilter: 'blur(12px) brightness(0.7)',
            }}
          />
        ) : null}
        {/* Bottom-fade overlay: page background bleeds in. */}
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, transparent 0%, transparent 55%, var(--lp-bg) 100%)',
          }}
        />
        {/* Logo — 88×88 circle, half-extends below the banner.
            Positioned bottom-left with negative bottom so it
            overlaps the identity strip below. */}
        <div
          className="absolute"
          style={{
            left: 'var(--lp-space-6)',
            bottom: -44,
            width: 88,
            height: 88,
            borderRadius: 'var(--lp-radius-full)',
            border: '2px solid var(--lp-bg)',
            boxShadow: 'var(--lp-shadow-md)',
            overflow: 'hidden',
            background: 'var(--lp-bg-deep)',
          }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
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
            <ArtistInitialsChip name={artistName} size={88} fontSize={28} />
          )}
        </div>
      </div>

      {/* Identity strip — sits BELOW the banner. The logo's -44px
          bottom offset half-extends into this strip. Padding-top
          matches the half-extending logo so the artist name sits
          to the right of the logo center. */}
      <div
        className="flex items-end justify-between"
        style={{
          padding: `var(--lp-space-2) var(--lp-space-6) 0 calc(var(--lp-space-6) + 88px + var(--lp-space-4))`,
          minHeight: 56,
        }}
      >
        <div className="min-w-0 flex-1">
          <h1
            className="truncate"
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 'var(--lp-weight-bold)',
              color: 'var(--lp-text)',
              lineHeight: 1.1,
            }}
          >
            {artistName}
          </h1>
          <div
            className="mt-1 truncate"
            style={{
              fontSize: 'var(--lp-text-2xs)',
              fontWeight: 'var(--lp-weight-bold)',
              letterSpacing: 'var(--lp-tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {metaLine}
          </div>
        </div>
        <EditArtistButton artist={editArtist} />
      </div>
    </div>
  );
}
