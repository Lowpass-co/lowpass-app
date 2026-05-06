/* ============================================
   LOWPASS — Spotify server helpers (Sprint 7 §2)

   Shared module for the server-side Spotify integration.
   Replaces the duplicated `getSpotifyToken()` helpers that were
   inline in /api/spotify/search and /api/artists/spotify-releases
   pre-Sprint 7.

   Caches:
   - Access token: module-level. Single token shared across all
     callers; refreshed lazily when expired (or within 60s of
     expiry as a buffer). Spotify's client_credentials tokens
     last 1 hour; we were re-fetching one per request before this.
   - Per-artist Spotify image+meta: module-level Map keyed on
     spotify_id. 24h TTL. Image URLs change rarely; reduces
     Spotify API load and noticeably speeds up artist surface
     paints (Phases 4 + 5 fan out fetches per artist card).

   Both caches reset on cold start; that's fine for our scale —
   no Redis/KV dep needed. If the worker pool churns, worst case
   we refetch a token + a few artist images, all small calls.

   Auth flow is Client Credentials (server-only). Public artist
   data is fetchable without user OAuth. User-OAuth Spotify
   linking is deferred to a separate sprint per the prompt's
   out-of-scope list.

   Required env vars:
     SPOTIFY_CLIENT_ID
     SPOTIFY_CLIENT_SECRET

   When missing, helpers return null / clean error responses;
   downstream consumers handle the absence by falling through
   their fallback chains (logo → spotify_image_url DB snapshot
   → live fetch → initials chip).
   ============================================ */

interface CachedToken {
  token: string;
  /** Unix ms timestamp at which to refetch. ~60s before actual
   *  expiry to avoid edge-of-expiry races. */
  refetchAt: number;
}

let cachedToken: CachedToken | null = null;

/** Inflight token-fetch promise — coalesces concurrent calls so
 *  we don't fire N parallel token requests on a cold start. */
let inflightTokenFetch: Promise<string | null> | null = null;

export async function getSpotifyToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedToken.refetchAt) {
    return cachedToken.token;
  }
  if (inflightTokenFetch) return inflightTokenFetch;

  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;

  inflightTokenFetch = (async () => {
    try {
      const auth = Buffer.from(`${id}:${secret}`).toString('base64');
      const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${auth}`,
        },
        body: 'grant_type=client_credentials',
        // Edge runtime: don't reuse cache; tokens are short-lived.
        cache: 'no-store',
      });
      if (!res.ok) {
        cachedToken = null;
        return null;
      }
      const data = (await res.json()) as {
        access_token?: string;
        expires_in?: number;
      };
      const token = data.access_token ?? null;
      const expiresIn = data.expires_in ?? 3600;
      if (!token) {
        cachedToken = null;
        return null;
      }
      cachedToken = {
        token,
        refetchAt: now + Math.max(60, expiresIn - 60) * 1000,
      };
      return token;
    } catch {
      cachedToken = null;
      return null;
    } finally {
      inflightTokenFetch = null;
    }
  })();

  return inflightTokenFetch;
}

/** Public projection of a Spotify artist's image set + meta.
 *  Three image sizes mirror Spotify's standard 640/320/160 grid;
 *  consumer picks whichever fits the surface. */
export interface SpotifyArtistImageMeta {
  /** Spotify artist id this is keyed on. */
  spotifyId: string;
  /** Display name from Spotify (sanity-check vs DB name). */
  name: string;
  /** ~640px square. Use for hero banner backgrounds. */
  image640: string | null;
  /** ~320px. Use for medium thumbnails. */
  image320: string | null;
  /** ~160px. Use for trigger / row avatars. */
  image160: string | null;
  /** Genre tags from Spotify, lower-cased. May be empty. */
  genres: string[];
  /** Total followers — null if Spotify omits. */
  followers: number | null;
}

interface CachedArtist {
  meta: SpotifyArtistImageMeta;
  refetchAt: number;
}

const ARTIST_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const artistCache = new Map<string, CachedArtist>();
const inflightArtistFetch = new Map<
  string,
  Promise<SpotifyArtistImageMeta | null>
>();

/** Fetch (or return cached) Spotify artist image+meta. Returns
 *  null when Spotify is unconfigured, the artist doesn't exist
 *  on Spotify, or the API errors. Consumers fall through to the
 *  next link in their fallback chain. */
export async function getSpotifyArtistMeta(
  spotifyId: string,
): Promise<SpotifyArtistImageMeta | null> {
  if (!spotifyId) return null;
  const now = Date.now();
  const cached = artistCache.get(spotifyId);
  if (cached && now < cached.refetchAt) {
    return cached.meta;
  }
  const inflight = inflightArtistFetch.get(spotifyId);
  if (inflight) return inflight;

  const promise = (async (): Promise<SpotifyArtistImageMeta | null> => {
    try {
      const token = await getSpotifyToken();
      if (!token) return null;
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${encodeURIComponent(spotifyId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        // Spotify returned 4xx/5xx — don't cache the failure
        // permanently, but skip retrying for 5 minutes so a
        // broken artist id doesn't hammer the API.
        artistCache.set(spotifyId, {
          meta: emptyMeta(spotifyId),
          refetchAt: now + 5 * 60 * 1000,
        });
        return null;
      }
      const data = (await res.json()) as {
        name?: string;
        images?: { url: string; width: number; height: number }[];
        genres?: string[];
        followers?: { total?: number };
      };
      // Spotify returns images in descending size order. Pick the
      // closest to 640/320/160 by width.
      const images = data.images ?? [];
      const meta: SpotifyArtistImageMeta = {
        spotifyId,
        name: data.name ?? '',
        image640: pickClosestImage(images, 640),
        image320: pickClosestImage(images, 320),
        image160: pickClosestImage(images, 160),
        genres: (data.genres ?? []).map((g) => g.toLowerCase()),
        followers: data.followers?.total ?? null,
      };
      artistCache.set(spotifyId, { meta, refetchAt: now + ARTIST_TTL_MS });
      return meta;
    } catch {
      return null;
    } finally {
      inflightArtistFetch.delete(spotifyId);
    }
  })();

  inflightArtistFetch.set(spotifyId, promise);
  return promise;
}

function pickClosestImage(
  images: { url: string; width: number; height: number }[],
  targetWidth: number,
): string | null {
  if (images.length === 0) return null;
  let best = images[0];
  let bestDiff = Math.abs((images[0].width ?? 0) - targetWidth);
  for (const img of images) {
    const diff = Math.abs((img.width ?? 0) - targetWidth);
    if (diff < bestDiff) {
      best = img;
      bestDiff = diff;
    }
  }
  return best.url;
}

function emptyMeta(spotifyId: string): SpotifyArtistImageMeta {
  return {
    spotifyId,
    name: '',
    image640: null,
    image320: null,
    image160: null,
    genres: [],
    followers: null,
  };
}

/** True when the env vars are present. Used by routes to return
 *  503 with an instructive error instead of a generic 500. */
export function isSpotifyConfigured(): boolean {
  return !!(
    process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET
  );
}
