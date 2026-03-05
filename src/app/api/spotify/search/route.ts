/* ============================================
   LOWPASS — Spotify Artist Search

   GET ?q=... — Search Spotify for artists.
   Returns id, name, image_url, banner_url (if 2nd image).
   Requires SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

async function getSpotifyToken(): Promise<string | null> {
  const id = process.env.SPOTIFY_CLIENT_ID;
  const secret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token ?? null;
}

export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: 'Query required (min 2 chars)' }, { status: 400 });
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
  const artists = (data.artists?.items ?? []).map((a: { id: string; name: string; images?: { url: string }[] }) => {
    const images = a.images ?? [];
    const imageUrl = images[0]?.url ?? null;
    const bannerUrl = images[1]?.url ?? images[0]?.url ?? null;
    return {
      id: a.id,
      name: a.name,
      image_url: imageUrl,
      banner_url: bannerUrl,
    };
  });

  return NextResponse.json(artists);
}
