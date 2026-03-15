'use client';

import { useState, useEffect } from 'react';
import { ExternalLink, Loader2, Music, ChevronRight, ChevronLeft } from 'lucide-react';

type SpotifyReleaseItem = {
  id: string;
  name: string;
  artist_name: string;
  url: string;
  release_date: string;
  type: string;
};

export function SpotifyReleasesPanel() {
  const [releases, setReleases] = useState<SpotifyReleaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    fetch('/api/artists/spotify-releases')
      .then((r) => (r.ok ? r.json() : { releases: [] }))
      .then((data) => setReleases(data.releases ?? []))
      .catch(() => setReleases([]))
      .finally(() => setLoading(false));
  }, []);

  if (collapsed) {
    return (
      <aside className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-lp-border bg-lp-surface py-3">
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="flex items-center gap-1 text-xs font-medium text-lp-text-tertiary hover:text-lp-text"
          aria-label="Expand new releases"
        >
          <Music className="h-4 w-4" />
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="mt-2 -rotate-90 origin-center whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-lp-text-tertiary">
          New releases
        </span>
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 rounded-xl border border-lp-border bg-lp-surface overflow-hidden flex flex-col max-h-[calc(100vh-12rem)]">
      <div className="flex items-center justify-between border-b border-lp-border px-4 py-3">
        <h2 className="text-sm font-semibold text-lp-text flex items-center gap-2">
          <Music className="h-4 w-4 text-lp-orange" />
          New releases
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="p-1 text-lp-text-tertiary hover:text-lp-text rounded"
          aria-label="Collapse panel"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
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
                    {r.artist_name && (
                      <span className="block truncate text-xs text-lp-text-secondary">{r.artist_name}</span>
                    )}
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
