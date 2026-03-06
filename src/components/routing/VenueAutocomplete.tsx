/* ============================================
   LOWPASS — Venue field with Google Places live search

   As user types, fetches suggestions; on select
   fetches place details and fills address.
   ============================================ */

'use client';

import { useState, useRef, useEffect } from 'react';

export interface VenuePlaceResult {
  venue_name: string;
  address: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  website?: string;
  phone?: string;
  rating?: number;
  capacity?: number | null;
}

export function VenueAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  placeholder = 'Venue',
  className,
}: {
  value: string;
  onChange: (venueName: string) => void;
  onPlaceSelect?: (result: VenuePlaceResult) => void;
  placeholder?: string;
  className?: string;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setHighlightedIndex((i) => (suggestions.length ? Math.min(i, suggestions.length - 1) : 0));
  }, [suggestions.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || highlightedIndex < 0) return;
    const item = list.children[highlightedIndex];
    if (item) (item as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  const queryFromUserRef = useRef(false);

  useEffect(() => {
    setQuery(value);
    queryFromUserRef.current = false;
  }, [value]);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      if (!queryFromUserRef.current) setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const fromUser = queryFromUserRef.current;
      fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query }),
      })
        .then((r) => r.json())
        .then((data) => {
          setSuggestions(data.suggestions ?? []);
          setHighlightedIndex(0);
          if (fromUser) setOpen(true);
        })
        .catch(() => setSuggestions([]))
        .finally(() => setLoading(false));
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const selectByIndex = (i: number) => {
    const s = suggestions[i];
    if (s) handleSelect(s.placeId, s.text);
  };

  const handleSelect = async (placeId: string, text: string) => {
    setOpen(false);
    setSuggestions([]);
    queryFromUserRef.current = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`, { signal });
      if (!res.ok) {
        onChange(text);
        return;
      }
      const d = await res.json();
      const venueName = d.displayName || text;
      onChange(venueName);
      onPlaceSelect?.({
        venue_name: venueName,
        address: d.formattedAddress || '',
        city: d.locality,
        country: d.country,
        latitude: d.latitude,
        longitude: d.longitude,
        website: d.website,
        phone: d.phone,
        rating: d.rating,
        capacity: null,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onChange(text);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          queryFromUserRef.current = true;
          setQuery(e.target.value);
        }}
        onKeyDown={(e) => {
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            selectByIndex(highlightedIndex);
            return;
          }
          if (e.key === 'Tab') {
            selectByIndex(highlightedIndex);
            // allow default so focus moves to next field
            return;
          }
        }}
        onFocus={() => {
          if (query.length >= 2) {
            queryFromUserRef.current = true;
            if (suggestions.length > 0) {
              setOpen(true);
            } else {
              setLoading(true);
              fetch('/api/places/autocomplete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ input: query }),
              })
                .then((r) => r.json())
                .then((data) => {
                  setSuggestions(data.suggestions ?? []);
                  setHighlightedIndex(0);
                  setOpen(true);
                })
                .catch(() => {})
                .finally(() => setLoading(false));
            }
          }
        }}
        placeholder={placeholder}
        className="w-full min-w-[120px] rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-lp-text-tertiary">
          …
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 right-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
          role="listbox"
        >
          {suggestions.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === highlightedIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(s.placeId, s.text)}
                onMouseEnter={() => setHighlightedIndex(i)}
                className={`w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover ${i === highlightedIndex ? 'bg-lp-surface-hover' : ''}`}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
