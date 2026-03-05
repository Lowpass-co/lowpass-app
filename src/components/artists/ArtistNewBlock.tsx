/* ============================================
   LOWPASS — New Artist Block

   Search Spotify or add manually. Sliding toggles.
   Selected artist = hero. Logo (for exports) with
   drag-and-drop. Banner from Spotify only.
   ============================================ */

'use client';

import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search } from 'lucide-react';
import { SlidingToggle } from '@/components/ui/SlidingToggle';
import { ArtistPreviewCard } from '@/components/artists/ArtistPreviewCard';
import { cn } from '@/lib/utils';

/** Reusable logo upload field (drag/drop, click). Used in new-artist block and when selecting existing artist. */
export function ArtistLogoField({
  logoUrl,
  onChange,
}: {
  logoUrl?: string;
  onChange: (url: string) => void;
}) {
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoDrag, setLogoDrag] = useState(false);

  const uploadAsset = async (file: File) => {
    setLogoUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('type', 'logo');
      const res = await fetch('/api/upload/artist-asset', { method: 'POST', body: form });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Upload failed');
      }
      const { url } = await res.json();
      onChange(url);
    } finally {
      setLogoUploading(false);
    }
  };

  const handleLogoDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setLogoDrag(false);
    const f = e.dataTransfer.files?.[0];
    if (f && /^image\/(jpeg|png|webp|gif)$/i.test(f.type)) uploadAsset(f);
  };

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadAsset(f);
    e.target.value = '';
  };

  return (
    <div className="border-t border-lp-border pt-8">
      <p className="mb-3 text-sm font-medium text-lp-text-secondary">Logo</p>
      <div className="flex flex-col items-center">
        <label
          onDragOver={(e) => { e.preventDefault(); setLogoDrag(true); }}
          onDragLeave={() => setLogoDrag(false)}
          onDrop={handleLogoDrop}
          className={cn(
            'flex min-h-[96px] w-full max-w-xs cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-colors',
            logoDrag ? 'border-lp-orange bg-lp-orange-subtle' : 'border-lp-border bg-lp-surface hover:border-lp-text-tertiary hover:bg-lp-surface-hover',
            logoUrl && 'border-solid border-lp-border bg-lp-surface'
          )}
        >
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={logoUploading}
            onChange={handleLogoFile}
          />
          {logoUrl ? (
            <div className="flex flex-col items-center gap-3 p-4">
              <img
                src={logoUrl}
                alt="Logo"
                className="max-h-20 max-w-[200px] object-contain"
              />
              <span className="text-sm text-lp-text-tertiary">
                {logoUploading ? 'Uploading…' : 'Click or drop to replace'}
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
              <span className="text-sm font-medium text-lp-text-secondary">
                {logoUploading ? 'Uploading…' : 'Drop image here or click to browse'}
              </span>
              <span className="text-xs text-lp-text-tertiary">JPEG, PNG, WebP or GIF · max 5MB</span>
            </div>
          )}
        </label>
      </div>
    </div>
  );
}

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
  const [searchFocused, setSearchFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const clearSpotifySelection = () => {
    onChange({
      ...value,
      name: '',
      spotify_id: undefined,
      spotify_image_url: undefined,
      spotify_banner_url: undefined,
    });
  };

  const hasSelectedArtist = !!(value.spotify_id || (source === 'manual' && value.name.trim()));
  const showSearchResults = source === 'spotify' && searchFocused && searchQuery.length >= 2;

  useLayoutEffect(() => {
    if (showSearchResults && searchResults.length > 0 && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: rect.width });
    } else {
      setDropdownRect(null);
    }
  }, [showSearchResults, searchResults.length]);

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
  }, [source, searchQuery, value.spotify_id]);

  const selectSpotify = (a: SpotifyResult) => {
    onChange({
      ...value,
      name: a.name,
      spotify_id: a.id,
      spotify_image_url: a.image_url ?? undefined,
      spotify_banner_url: a.banner_url ?? undefined,
    });
    setSearchResults([]);
    setSearchFocused(false);
    inputRef.current?.blur();
  };

  const clearSelection = () => {
    clearSpotifySelection();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="space-y-8">
      <SlidingToggle
        value={source}
        onChange={(v) => setSource(v)}
        options={['spotify', 'manual']}
        labels={['Search Spotify', 'Not on Spotify']}
      />

      {source === 'spotify' ? (
        <>
          {/* STATE 2: Artist selected — hide search, show compact card only */}
          {value.spotify_id ? (
            <ArtistPreviewCard
              imageUrl={value.spotify_image_url}
              name={value.name || 'Artist'}
              viaLabel="Via Spotify"
              onChangeArtist={clearSelection}
            />
          ) : (
            /* STATE 1: Search — input + dropdown list (max 5, 40x40 images, list style) */
            <div className="relative">
              <label className="mb-1.5 block text-sm font-medium text-lp-text-secondary">
                Search for artist
              </label>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-lp-text-tertiary" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                  placeholder="e.g. Good Neighbours"
                  className="w-full rounded-xl border border-lp-border bg-lp-surface py-3 pl-11 pr-4 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
                />
              </div>
              {searching && (
                <p className="mt-1.5 text-sm text-lp-text-tertiary">Searching…</p>
              )}
              {showSearchResults && searchResults.length > 0 && dropdownRect && typeof document !== 'undefined' && createPortal(
                <div
                  className="z-[100] overflow-hidden rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
                  style={{
                    position: 'fixed',
                    top: dropdownRect.top + 4,
                    left: dropdownRect.left,
                    width: Math.max(dropdownRect.width, 280),
                    minWidth: 280,
                  }}
                >
                  <ul className="py-1">
                    {searchResults.slice(0, 5).map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectSpotify(a)}
                          className="flex w-full flex-row items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-lp-bg-tertiary cursor-pointer"
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
                          <span className="text-sm font-medium text-lp-text">{a.name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>,
                document.body
              )}
            </div>
          )}
        </>
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-lp-text-secondary">
            Artist name
          </label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder="Artist or band name"
            className="w-full rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
          />
          {value.name.trim() && (
            <div className="mt-4 rounded-2xl border border-lp-border bg-lp-surface p-6">
              <p className="font-display text-xl font-bold tracking-tight text-lp-orange">
                {value.name}
              </p>
              <p className="mt-0.5 text-sm text-lp-text-tertiary">Not on Spotify</p>
            </div>
          )}
        </div>
      )}

      <ArtistLogoField
        logoUrl={value.logo_url}
        onChange={(url) => onChange({ ...value, logo_url: url })}
      />
    </div>
  );
}
