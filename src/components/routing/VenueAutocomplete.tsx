/* ============================================
   LOWPASS — Venue field with Google Places live search

   As user types, fetches suggestions; on select
   fetches place details and fills address.
   ============================================ */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/ui/Toast';

export interface VenuePlaceResult {
  /** Google Place ID — the cross-tenant canonical-venue dedupe key. */
  place_id?: string;
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
  const { showToast } = useToast();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Sprint 8.5 §3 — set true while a click-pick is in flight so
  // the input's onBlur (added in Sprint 8.2 §4d to sync free-
  // text edits) doesn't fire onChange(query) BEFORE handleSelect's
  // /api/places/details fetch resolves and overwrites the picked
  // venue_name + address with the partially-typed text. Cleared
  // in finally so any failure path (including aborted fetch)
  // releases the suppression.
  const isPickingRef = useRef(false);

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

  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLUListElement | null>(null);

  useLayoutEffect(() => {
    if (open && suggestions.length > 0 && containerRef.current) {
      const input = containerRef.current.querySelector('input');
      const rect = input?.getBoundingClientRect();
      if (rect) setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropdownRect(null);
    }
  }, [open, suggestions.length]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
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
    // Sprint 8.5 §3 — defensive fixes for "click-pick doesn't fill
    // address" (Adam's smoke against 8.3 §2). Three changes:
    //   1. isPickingRef true throughout to suppress onBlur sync.
    //   2. No redundant onChange(venueName) before onPlaceSelect —
    //      onPlaceSelect's payload already includes venue_name,
    //      so the second update is sufficient and avoids any
    //      batching race where the first state update wins.
    //   3. Failure paths surface a toast + console.error so the
    //      cause (missing API key, rate limit, network) is visible
    //      instead of silently leaving address blank.
    isPickingRef.current = true;
    setOpen(false);
    setSuggestions([]);
    queryFromUserRef.current = false;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(placeId)}`,
        { signal },
      );
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        console.error(
          `[VenueAutocomplete] /api/places/details failed: ${res.status}`,
          errBody,
        );
        showToast(
          res.status === 503
            ? 'Places API not configured. Address autofill unavailable.'
            : 'Could not fetch venue details. Address not filled.',
        );
        // Still write the typed text as venue_name so the user
        // doesn't lose their input. Address stays untouched.
        onChange(text);
        return;
      }
      const d = await res.json();
      // Sprint 8.6 §3 — verbose logging so Adam can see the
      // actual response shape when address fails to fill.
      // Adam's smoke against 8.5 §3: clicking a suggestion fills
      // location but not address. The 8.5 §3 toast covers the
      // 503/error paths; this logs the 200-but-empty path that
      // could also leave address blank.
      console.log('[VenueAutocomplete] /api/places/details ok:', {
        placeId,
        displayName: d.displayName,
        formattedAddress: d.formattedAddress,
        hasLocation: !!d.latitude && !!d.longitude,
      });
      const venueName = d.displayName || text;
      // Sprint 8.6 §3 — explicit null fallback (was empty
      // string). The receiver writes whatever is passed; if the
      // address is null, the receiver's spread leaves row.address
      // untouched. Empty string would have OVERWRITTEN existing
      // row.address with '' — visible "address cleared" effect.
      const formattedAddress: string | null =
        typeof d.formattedAddress === 'string' && d.formattedAddress.trim()
          ? d.formattedAddress
          : null;
      if (!formattedAddress) {
        console.warn(
          '[VenueAutocomplete] place returned without formattedAddress — leaving row.address unchanged',
          { placeId, displayName: d.displayName },
        );
        showToast(
          'No address available for this place — fill manually if needed.',
        );
      }
      // Single update — onPlaceSelect's payload covers venue_name
      // plus address, city, lat/lng, etc. Dropping the redundant
      // onChange(venueName) eliminates the batching window where
      // onBlur could fire between the two updates.
      onPlaceSelect?.({
        // The Place ID we already have in hand — previously discarded.
        // Feeds canonical-venue find-or-create on save (migration 214).
        place_id: placeId,
        venue_name: venueName,
        // Pass null when no address — receiver should preserve
        // existing row.address rather than clobber with ''.
        address: formattedAddress ?? '',
        city: d.locality,
        country: d.country,
        latitude: d.latitude,
        longitude: d.longitude,
        website: d.website,
        phone: d.phone,
        rating: d.rating,
        capacity: null,
      });
      // Fallback: when onPlaceSelect isn't wired (component used
      // standalone), still write venue_name via onChange so the
      // pick isn't lost.
      if (!onPlaceSelect) {
        onChange(venueName);
      }
    } catch (err) {
      // Sprint 8.6.2 — also bail when our signal was aborted by a
      // newer handleSelect call. The aborted stream can throw
      // inside res.json() as a generic TypeError (not AbortError),
      // which previously fell through to the failure toast even
      // though the newer call was about to succeed and fill the
      // address. Symptom Adam reported: toast fires on a pick that
      // visibly filled correctly.
      if ((err as Error).name === 'AbortError' || signal.aborted) return;
      console.error('[VenueAutocomplete] place details threw:', err);
      showToast('Network error fetching venue details.');
      onChange(text);
    } finally {
      isPickingRef.current = false;
    }
  };

  const listRefCallback = (el: HTMLUListElement | null) => {
    listRef.current = el;
    dropdownRef.current = el;
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
        onBlur={() => {
          // Sprint 8.2 §4 — sync free-text edits to the parent's
          // onChange on blur. Previously typing only updated
          // local `query` state; the parent's venue_name was
          // only written via handleSelect (autocomplete pick),
          // so any typed-but-not-picked text was silently lost
          // on save.
          //
          // Sprint 8.5 §3 — suppress sync while a click-pick is
          // in flight. handleSelect awaits /api/places/details;
          // if blur fires during that await, this would write
          // the partially-typed text as venue_name and (via the
          // [value] effect) clobber any pick result that arrives
          // moments later. isPickingRef releases in handleSelect's
          // finally block — including aborted/failed paths.
          if (isPickingRef.current) return;
          if (query !== value) {
            onChange(query);
          }
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
          // Sprint 8.3 §2 — Tab no longer auto-picks the highlighted
          // suggestion. Adam's smoke against 8.2 §4d: editing the
          // location post-pick and tabbing away overwrote the address
          // because Tab was interpreted as "confirm the highlighted
          // suggestion" (highlightedIndex defaults to 0 — the first
          // result). Common autocomplete UX: only Enter or click
          // commits a pick. Tab now blurs normally; the onBlur sync
          // (8.2 §4d) writes the typed venue_name without touching
          // the address column.
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
      {open && suggestions.length > 0 && dropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRefCallback}
            role="listbox"
            className="lp-dropdown-layer fixed max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, minWidth: 200 }}
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
          </ul>,
          document.body
        )}
    </div>
  );
}
