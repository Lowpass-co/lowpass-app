/* ============================================
   LOWPASS — Sprint 7 §4 — <NewReleasesGrid>

   Renders a 3-column grid of recent albums/singles for one
   artist via Spotify. Mounted on /artists/[id] only when the
   artist has spotify_id set.

   Client component — fetches via the existing
   /api/artists/spotify-releases endpoint, then filters down to
   this artist's spotifyId. Could be moved server-side later
   for SSR; the wait isn't worth it for a non-critical
   below-the-fold section.
   ============================================ */

'use client';

import { useEffect, useState } from 'react';

interface ReleaseItem {
  id: string;
  name: string;
  artist_name: string;
  url: string;
  release_date: string;
  type: string;
}

export function NewReleasesGrid({ artistName }: { artistName: string }) {
  const [items, setItems] = useState<ReleaseItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/artists/spotify-releases')
      .then((r) => (r.ok ? r.json() : { releases: [] }))
      .then((data: { releases?: ReleaseItem[] }) => {
        if (cancelled) return;
        const all = data.releases ?? [];
        // Filter to this artist by name match. The endpoint
        // doesn't support filtering by spotify_id directly;
        // a future cleanup could add ?artist_id=X. Name match
        // is cheap and good enough.
        const mine = all
          .filter(
            (r) =>
              r.artist_name &&
              r.artist_name.toLowerCase() === artistName.toLowerCase(),
          )
          .slice(0, 6);
        setItems(mine);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setItems([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [artistName]);

  if (loading) {
    return (
      <div
        style={{
          padding: 'var(--lp-space-4)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        Loading releases…
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div
        style={{
          padding: 'var(--lp-space-4)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        No recent releases found on Spotify.
      </div>
    );
  }

  return (
    <div
      className="grid"
      style={{
        gap: 'var(--lp-space-3)',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
      }}
    >
      {items.map((r) => (
        <a
          key={r.id}
          href={r.url}
          target="_blank"
          rel="noreferrer"
          className="lp-artist-product-card flex items-center"
          style={{
            gap: 'var(--lp-space-3)',
            padding: 'var(--lp-space-3)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            textDecoration: 'none',
          }}
        >
          {/* Cover thumb — Spotify includes images on the album
              record but the existing endpoint strips them down to
              meta only. Keeping a token square placeholder for
              visual rhythm; future revision can pass image_url
              through the endpoint. */}
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--lp-radius-sm)',
              background:
                'color-mix(in srgb, var(--color-lp-orange) 15%, transparent)',
              flexShrink: 0,
            }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="truncate"
              style={{
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-medium)',
                color: 'var(--lp-text)',
              }}
            >
              {r.name}
            </div>
            <div
              style={{
                fontSize: 'var(--lp-text-2xs)',
                fontWeight: 'var(--lp-weight-bold)',
                letterSpacing: 'var(--lp-tracking-caps)',
                textTransform: 'uppercase',
                color: 'var(--lp-text-tertiary)',
                marginTop: 2,
              }}
            >
              {r.type} · {r.release_date.slice(0, 4)}
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
