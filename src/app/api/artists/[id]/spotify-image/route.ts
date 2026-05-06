/* ============================================
   LOWPASS — Spotify image + meta for one artist (Sprint 7 §2)

   GET /api/artists/[id]/spotify-image

   Returns the artist's Spotify images (640 / 320 / 160 px URLs)
   plus meta (genres, follower count). Used by the new artist
   surfaces (Phases 4 + 5) for hero banners + profile cards. The
   per-artist response is cached 24h in src/lib/spotify/server.ts
   so re-renders / multiple consumers don't fan out repeated
   Spotify calls.

   Status codes:
     200 — artist linked, Spotify returned data.
     404 — artist exists but has no spotify_id (caller should
           fall through to initials chip / gradient banner).
     503 — Spotify env vars missing (clean error, NOT 500).
     502 — Spotify API errored (rare — rate limit / outage).

   The route is auth-gated. RLS on `artists` ensures the caller
   can only resolve artists in their workspace.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getSpotifyArtistMeta,
  isSpotifyConfigured,
} from '@/lib/spotify/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: artistId } = await params;
  if (!artistId) {
    return NextResponse.json(
      { error: 'artist id required' },
      { status: 400 },
    );
  }

  if (!isSpotifyConfigured()) {
    return NextResponse.json(
      {
        error:
          'Spotify not configured. Set SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.',
      },
      { status: 503 },
    );
  }

  // RLS handles workspace scoping. Pull spotify_id only.
  const { data, error } = await supabase
    .from('artists')
    .select('id, spotify_id')
    .eq('id', artistId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
  }
  const spotifyId = (data as { spotify_id: string | null }).spotify_id;
  if (!spotifyId) {
    // Artist exists but isn't linked to Spotify. 404 is the right
    // signal — caller falls through to initials / gradient.
    return NextResponse.json(
      { error: 'Artist has no spotify_id linked' },
      { status: 404 },
    );
  }

  const meta = await getSpotifyArtistMeta(spotifyId);
  if (!meta) {
    // Token failure or upstream error. The cache layer suppresses
    // retries for 5 minutes on upstream failure (see server.ts) so
    // a broken artist id doesn't hammer the API.
    return NextResponse.json(
      { error: 'Spotify upstream error' },
      { status: 502 },
    );
  }

  return NextResponse.json({ artist: meta });
}
