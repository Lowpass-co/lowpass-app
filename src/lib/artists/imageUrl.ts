/* ============================================
   LOWPASS — Artist image fallback chain (Sprint 7 §3)

   Resolves an artist's logo / banner URL through a fallback
   chain shared by every consumer that renders artist visuals.
   Sprint 4 had the same logic inline in <ArtistTourSwitcher>;
   Phases 3 / 4 / 5 of Sprint 7 fan it out across multiple
   surfaces, so it's worth extracting here.

   Logo chain (used by 24/40/60/88px circular avatars):
     1. branding.logo_url (user-uploaded — Sprint 8 territory)
     2. spotify_image_url (DB snapshot, set when artist linked)
     3. live fetch via getSpotifyArtistMeta(spotify_id) — uses
        the 24h cache in src/lib/spotify/server.ts
     4. null → caller renders initials chip

   Banner chain (used by /artists/[id] hero, artist cards):
     1. branding.banner_url
     2. spotify_banner_url (DB snapshot)
     3. live fetch via getSpotifyArtistMeta — picks image640
     4. null → caller renders gradient seeded by artist name

   Both helpers are server-side (the live-fetch path uses
   server-only Spotify env vars). They return null cleanly when
   no source resolves; consumers always handle null with their
   own fallback.
   ============================================ */

import { getSpotifyArtistMeta } from '@/lib/spotify/server';

interface ArtistImageInput {
  branding?: unknown;
  spotify_id?: string | null;
  spotify_image_url?: string | null;
  spotify_banner_url?: string | null;
}

function readBranding(branding: unknown): {
  logo_url?: string | null;
  banner_url?: string | null;
} {
  if (!branding || typeof branding !== 'object') return {};
  const b = branding as { logo_url?: unknown; banner_url?: unknown };
  return {
    logo_url:
      typeof b.logo_url === 'string' && b.logo_url.length > 0
        ? b.logo_url
        : null,
    banner_url:
      typeof b.banner_url === 'string' && b.banner_url.length > 0
        ? b.banner_url
        : null,
  };
}

/** Resolve the artist's logo URL through the fallback chain.
 *  Async because step 3 may live-fetch via Spotify. */
export async function resolveArtistLogoUrl(
  artist: ArtistImageInput,
): Promise<string | null> {
  const branding = readBranding(artist.branding);
  if (branding.logo_url) return branding.logo_url;
  if (artist.spotify_image_url) return artist.spotify_image_url;
  if (artist.spotify_id) {
    const meta = await getSpotifyArtistMeta(artist.spotify_id);
    if (meta?.image320) return meta.image320;
    if (meta?.image160) return meta.image160;
  }
  return null;
}

/** Resolve the artist's banner URL through the fallback chain. */
export async function resolveArtistBannerUrl(
  artist: ArtistImageInput,
): Promise<string | null> {
  const branding = readBranding(artist.branding);
  if (branding.banner_url) return branding.banner_url;
  if (artist.spotify_banner_url) return artist.spotify_banner_url;
  if (artist.spotify_id) {
    const meta = await getSpotifyArtistMeta(artist.spotify_id);
    if (meta?.image640) return meta.image640;
    if (meta?.image320) return meta.image320;
  }
  return null;
}

/** Synchronous variant — uses only DB-backed values, never
 *  triggers a Spotify fetch. For client components or pages
 *  that don't want to await the fallback chain.
 *  Returns null even if a Spotify live-fetch would have
 *  succeeded; caller handles null. */
export function resolveArtistLogoUrlSync(
  artist: ArtistImageInput,
): string | null {
  const branding = readBranding(artist.branding);
  return branding.logo_url ?? artist.spotify_image_url ?? null;
}

export function resolveArtistBannerUrlSync(
  artist: ArtistImageInput,
): string | null {
  const branding = readBranding(artist.branding);
  return branding.banner_url ?? artist.spotify_banner_url ?? null;
}

/** Two-letter initials, uppercase. Used as the final fallback
 *  in any avatar slot (initials chip on brand orange). */
export function getArtistInitials(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '?';
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 1) return tokens[0].slice(0, 2).toUpperCase();
  return (tokens[0][0] + tokens[tokens.length - 1][0]).toUpperCase();
}

/** Deterministic gradient color from an artist name. Used as
 *  the banner fallback when no image resolves. Returns a CSS
 *  linear-gradient string seeded by the name's char codes —
 *  same artist always gets the same colors. */
export function getArtistGradient(name: string | null | undefined): string {
  const seed = (name ?? '').trim() || 'artist';
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `linear-gradient(135deg, hsl(${hue}, 55%, 28%) 0%, hsl(${(hue + 40) % 360}, 45%, 18%) 100%)`;
}
