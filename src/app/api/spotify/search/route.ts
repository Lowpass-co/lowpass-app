/* ============================================
   LOWPASS — Spotify Artist Search

   GET ?q=... — Search Spotify for artists.
   Returns id, name, image_url, banner_url (if 2nd image), plus
   genres / followers / popularity (AB — the artist builder's result
   rows + confirm stats read these directly off the search hit, so no
   follow-up per-artist meta call is needed).
   Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.

   Sprint 7 §2 — token helper + caching extracted to
   src/lib/spotify/server.ts. This route just imports.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getSpotifyToken } from '@/lib/spotify/server';

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // AB — the builder searches from the first character (search-as-you-type),
  // so accept any non-empty query; Spotify itself tolerates 1-char queries.
  const q = searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ error: 'Query required' }, { status: 400 });
  }

  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json(
      { error: 'Spotify not configured. Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.' },
      { status: 503 }
    );
  }

  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({
      q,
      type: 'artist',
      limit: '10',
    })}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!searchRes.ok) {
    return NextResponse.json(
      { error: 'Spotify search failed' },
      { status: 502 }
    );
  }

  const data = await searchRes.json();
  const artists = (data.artists?.items ?? []).map(
    (a: {
      id: string;
      name: string;
      images?: { url: string }[];
      genres?: string[];
      followers?: { total?: number | null } | null;
      popularity?: number | null;
    }) => {
      const images = a.images ?? [];
      const imageUrl = images[0]?.url ?? null;
      const bannerUrl = images[1]?.url ?? images[0]?.url ?? null;
      return {
        id: a.id,
        name: a.name,
        image_url: imageUrl,
        banner_url: bannerUrl,
        genres: Array.isArray(a.genres) ? a.genres : [],
        followers: a.followers?.total ?? null,
        popularity: typeof a.popularity === 'number' ? a.popularity : null,
      };
    },
  );

  return NextResponse.json(artists);
}
