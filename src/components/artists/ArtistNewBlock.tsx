/* ============================================
   LOWPASS — New Artist Block (create flow)

   Search Spotify or add manually. Add logo (for
   exports) and optional banner. Exports use logo
   only, not Spotify profile pic.
   ============================================ */

'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, ImagePlus } from 'lucide-react';

export interface NewArtistPayload {
  name: string;
  spotify_id?: string;
  spotify_image_url?: string;
  spotify_banner_url?: string;
  logo_url?: string;
  banner_url?: string;
}

interface SpotifyResult {
  id: string;
  name: string;
  image_url: string | null;
  banner_url: string | null;
}

export function ArtistNewBlock({
  value,
  onChange,
}: {
  value: NewArtistPayload;
  onChange: (p: NewArtistPayload) => void;
}) {
  const [source, setSource] = useState<'spotify' | 'manual'>('spotify');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SpotifyResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bannerUploading, setBannerUploading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (source !== 'spotify' || searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearching(true);
      fetch(`/api/spotify/search?q=${encodeURIComponent(searchQuery)}`)
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setSearchResults(Array.isArray(data) ? data : []))
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [source, searchQuery]);

  const selectSpotify = (a: SpotifyResult) => {
    onChange({
      ...value,
      name: a.name,
      spotify_id: a.id,
      spotify_image_url: a.image_url ?? undefined,
      spotify_banner_url: a.banner_url ?? undefined,
    });
  };

  const uploadAsset = async (file: File, type: 'logo' | 'banner') => {
    const setUploading = type === 'logo' ? setLogoUploading : setBannerUploading;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', type);
      const res = await fetch('/api/upload/artist-asset', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await res.json();
      if (type === 'logo') onChange({ ...value, logo_url: url });
      else onChange({ ...value, banner_url: url });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="artistSource"
            checked={source === 'spotify'}
            onChange={() => setSource('spotify')}
            className="text-lp-orange focus:ring-lp-orange"
          />
          <span className="text-sm text-lp-text">Search Spotify</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="artistSource"
            checked={source === 'manual'}
            onChange={() => setSource('manual')}
            className="text-lp-orange focus:ring-lp-orange"
          />
          <span className="text-sm text-lp-text">Not on Spotify</span>
        </label>
      </div>

      {source === 'spotify' ? (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-lp-text-secondary">
              Search Spotify
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Good Neighbours"
                className="w-full rounded-lg border border-lp-border bg-lp-surface py-2 pl-9 pr-3 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
              />
            </div>
          </div>
          {searching && (
            <p className="text-sm text-lp-text-tertiary">Searching…</p>
          )}
          {searchResults.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-lp-border bg-lp-surface p-2">
              {searchResults.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => selectSpotify(a)}
                    className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                      value.spotify_id === a.id
                        ? 'bg-lp-orange-subtle'
                        : 'hover:bg-lp-surface-hover'
                    }`}
                  >
                    {a.image_url ? (
                      <img
                        src={a.image_url}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-full bg-lp-bg-tertiary" />
                    )}
                    <span className="font-medium text-lp-text">{a.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {value.spotify_id && (
            <p className="text-sm text-lp-text-secondary">
              Selected: <strong>{value.name}</strong>
              {value.spotify_image_url && (
                <span className="ml-2 inline-block h-8 w-8 overflow-hidden rounded-full">
                  <img src={value.spotify_image_url} alt="" className="h-full w-full object-cover" />
                </span>
              )}
            </p>
          )}
        </>
      ) : (
        <div>
          <label className="mb-1 block text-sm font-medium text-lp-text-secondary">Artist name</label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Artist or band name"
            className="w-full rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange"
          />
        </div>
      )}

      <div className="border-t border-lp-border pt-4">
        <p className="mb-2 text-sm font-medium text-lp-text-secondary">
          Add logo (used on exports — not profile pic)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
            <ImagePlus size={16} />
            {logoUploading ? 'Uploading…' : value.logo_url ? 'Change logo' : 'Upload logo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={logoUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAsset(f, 'logo');
                e.target.value = '';
              }}
            />
          </label>
          {value.logo_url && (
            <div className="flex items-center gap-2">
              <img
                src={value.logo_url}
                alt="Logo"
                className="h-10 w-10 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, logo_url: undefined })}
                className="text-xs text-lp-text-tertiary hover:text-lp-text"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-lp-text-secondary">
          Add banner (optional)
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text hover:bg-lp-surface-hover">
            <ImagePlus size={16} />
            {bannerUploading ? 'Uploading…' : value.banner_url ? 'Change banner' : 'Upload banner'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              disabled={bannerUploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAsset(f, 'banner');
                e.target.value = '';
              }}
            />
          </label>
          {value.banner_url && (
            <div className="flex items-center gap-2">
              <img
                src={value.banner_url}
                alt="Banner"
                className="h-12 w-20 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => onChange({ ...value, banner_url: undefined })}
                className="text-xs text-lp-text-tertiary hover:text-lp-text"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
