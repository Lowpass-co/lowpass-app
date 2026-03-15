'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Loader2, Music } from 'lucide-react';

type SpotifyReleaseItem = {
  id: string;
  name: string;
  artist_name: string;
  url: string;
  release_date: string;
  type: string;
};

function formatReleaseDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y) return dateStr;
  const month = m ? new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }) : '';
  if (d && m) return `${Number(d)} ${month} ${y}`;
  if (m) return `${month} ${y}`;
  return y;
}

function formatReleaseType(type: string): string {
  const t = (type || 'album').toLowerCase();
  if (t === 'single') return 'Single';
  if (t === 'compilation') return 'EP';
  return 'Album';
}

export function SpotifyReleasesPanel() {
  const [releases, setReleases] = useState<SpotifyReleaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/artists/spotify-releases')
      .then((r) => (r.ok ? r.json() : { releases: [] }))
      .then((data) => setReleases(data.releases ?? []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <aside className="w-72 shrink-0 rounded-xl border border-lp-border bg-lp-surface overflow-hidden flex flex-col max-h-[calc(100vh-12rem)]">
      <div className="border-b border-lp-border px-4 py-3">
        <h2 className="text-sm font-semibold text-lp-text flex items-center gap-2">
          <Music className="h-4 w-4 text-lp-orange" />
          New Releases
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-lp-text-tertiary">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : releases.length === 0 ? (
          <p className="py-6 text-center text-xs text-lp-text-tertiary">
            No recent releases. Link artists to Spotify to see new albums and singles.
          </p>
        ) : (
          <ul className="space-y-1">
            {releases.map((r) => (
              <li key={r.id}>
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-lp-surface-hover group"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-lp-text group-hover:text-lp-orange">
                      {r.name}
                    </span>
                    <span className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {r.artist_name && (
                        <span className="truncate text-xs text-lp-text-secondary">{r.artist_name}</span>
                      )}
                      {r.release_date && (
                        <span className="text-xs text-lp-text-tertiary">{formatReleaseDate(r.release_date)}</span>
                      )}
                      <span className="text-xs text-lp-text-tertiary">{formatReleaseType(r.type)}</span>
                    </span>
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-lp-text-tertiary mt-0.5" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
