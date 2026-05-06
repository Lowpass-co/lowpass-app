/* ============================================
   LOWPASS — Spotify New Releases for Workspace Artists

   GET — Returns recent albums/singles for artists that have spotify_id.
   Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.

   Sprint 7 §2 — token helper + caching extracted to
   src/lib/spotify/server.ts. This route just imports.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getSpotifyToken } from '@/lib/spotify/server';

export type SpotifyReleaseItem = {
  id: string;
  name: string;
  artist_name: string;
  url: string;
  release_date: string;
  type: string;
  /** Sprint 8 §3 — album/single cover art. Picks the medium-size
   *  image (~300px) from Spotify's response when available, falls
   *  back to the largest, falls back to null. Consumer renders an
   *  80px thumbnail so the medium size is the right balance. */
  image_url: string | null;
};

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ releases: [] });
  }

  const { data: artists } = await supabase
    .from('artists')
    .select('id, name, spotify_id')
    .eq('workspace_id', profile.workspace_id)
    .not('spotify_id', 'is', null)
    .limit(20);

  const spotifyIds = (artists ?? []).map((a) => (a as { spotify_id: string }).spotify_id).filter(Boolean);
  if (spotifyIds.length === 0) {
    return NextResponse.json({ releases: [] });
  }

  const token = await getSpotifyToken();
  if (!token) {
    return NextResponse.json({ releases: [] });
  }

  const artistNames = new Map(
    (artists ?? []).map((a) => [(a as { spotify_id: string }).spotify_id, (a as { name: string }).name ?? ''])
  );

  const allReleases: SpotifyReleaseItem[] = [];
  for (const spotifyId of spotifyIds.slice(0, 10)) {
    try {
      const res = await fetch(
        `https://api.spotify.com/v1/artists/${spotifyId}/albums?include_groups=album,single&limit=8&market=GB`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const items = data.items ?? [];
      const artistName = artistNames.get(spotifyId) ?? '';
      for (const item of items) {
        // Sprint 8 §3 — project the cover art. Spotify orders
        // images largest → smallest; index 1 (~300px) fits the
        // 80px thumbnail without optimizer overhead. Fall back
        // to the largest, then null.
        const imgs = (item.images ?? []) as Array<{ url?: string }>;
        const imageUrl =
          (imgs[1]?.url as string | undefined) ??
          (imgs[0]?.url as string | undefined) ??
          null;
        allReleases.push({
          id: item.id,
          name: item.name ?? '—',
          artist_name: artistName,
          url: item.external_urls?.spotify ?? `https://open.spotify.com/album/${item.id}`,
          release_date: item.release_date ?? '',
          type: item.album_type ?? 'album',
          image_url: imageUrl,
        });
      }
    } catch {
      // skip on error
    }
  }

  allReleases.sort((a, b) => b.release_date.localeCompare(a.release_date));
  const releases = allReleases.slice(0, 30);

  return NextResponse.json({ releases });
}
