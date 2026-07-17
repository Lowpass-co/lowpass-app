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

/** A hit from the world-readable venue library (GET /api/venues/canonical/search). */
export interface LibraryVenueMatch {
  id: string;
  name: string;
  city: string | null;
  country: string | null;
  address: string | null;
  capacity: number | null;
  lat: number | null;
  lng: number | null;
}

export function VenueAutocomplete({
  value,
  onChange,
  onPlaceSelect,
  onLibrarySelect,
  placeholder = 'Venue',
  className,
}: {
  value: string;
  onChange: (venueName: string) => void;
  onPlaceSelect?: (result: VenuePlaceResult) => void;
  /** Library-first (venue-library-aware routing): fired when the user picks an
   *  existing canonical venue. Links canonical_venue_id + auto-fills facts with NO
   *  Google Places billing. onPlaceSelect stays the create-new (Google) path. */
  onLibrarySelect?: (match: LibraryVenueMatch) => void;
  placeholder?: string;
  className?: string;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  // Library-first: matches from the venue library (cheap, no Places billing).
  // `mode` = 'library' while type-to-searching the library (default); flips to
  // 'places' only when the user chooses "Create new" → the Google path.
  const [libraryMatches, setLibraryMatches] = useState<LibraryVenueMatch[]>([]);
  const [mode, setMode] = useState<'library' | 'places'>('library');
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
  // F2 — one Places session token per typing session. Reused across the
  // debounced autocomplete requests and passed to the final Place Details
  // call, so Google bills the whole lookup as ONE session (Per Session SKU,
  // unlimited free) instead of N Per-Request calls + a separate Details
  // charge. Reset after a pick so the next lookup is a fresh session.
  const sessionTokenRef = useRef<string | null>(null);
  const ensureSessionToken = () => {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
    return sessionTokenRef.current;
  };

  // 'library' mode renders [libraryMatches…, "Create new"]; 'places' mode renders
  // the Google suggestions. totalItems drives highlight bounds + open-gating.
  const totalItems = mode === 'library' ? libraryMatches.length + 1 : suggestions.length;
  const hasDropdown = open && totalItems > 0;

  useEffect(() => {
    setHighlightedIndex((i) => (totalItems ? Math.min(i, totalItems - 1) : 0));
  }, [totalItems]);

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
    // A#10 design standard — suggestions from ≥1 char (was ≥2), 250ms debounce.
    // The library search is cheap (no Places billing), so type-ahead can start on
    // the first character; results render first, "Create new" stays last.
    if (query.length < 1) {
      setLibraryMatches([]);
      setSuggestions([]);
      if (!queryFromUserRef.current) setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const fromUser = queryFromUserRef.current;
      // Library-first: type-to-search the venue library (cheap, NO Places billing).
      // The Google Places path is invoked ONLY from the "Create new" row below.
      fetch(`/api/venues/canonical/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { venues: [] }))
        .then((data: { venues?: LibraryVenueMatch[] }) => {
          setLibraryMatches(data.venues ?? []);
          setMode('library');
          setSuggestions([]);
          setHighlightedIndex(0);
          if (fromUser) setOpen(true);
        })
        .catch(() => setLibraryMatches([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLUListElement | null>(null);

  useLayoutEffect(() => {
    if (hasDropdown && containerRef.current) {
      const input = containerRef.current.querySelector('input');
      const rect = input?.getBoundingClientRect();
      if (rect) setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    } else {
      setDropdownRect(null);
    }
  }, [hasDropdown]);

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
    if (mode === 'library') {
      if (i < libraryMatches.length) handleLibrarySelect(libraryMatches[i]);
      else handleCreateNew();
    } else {
      const s = suggestions[i];
      if (s) handleSelect(s.placeId, s.text);
    }
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
    // Close the billing session: pass this session's token to Details, then
    // reset so the next venue lookup starts a fresh session.
    const sessiontoken = sessionTokenRef.current;
    sessionTokenRef.current = null;
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(placeId)}${sessiontoken ? `&sessiontoken=${encodeURIComponent(sessiontoken)}` : ''}`,
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
        // Routing-city fix — use the route's robust inferredCity (locality →
        // postal_town → sublocality → admin_area) so venues without a `locality`
        // component (e.g. UK postal_town like Manchester) don't land a BLANK city.
        // Now English too (Part A languageCode=en). Fall back to raw locality.
        city: d.inferredCity ?? d.locality,
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

  // Pick an existing library venue — link + auto-fill with NO Places billing.
  const handleLibrarySelect = (m: LibraryVenueMatch) => {
    isPickingRef.current = true;
    setOpen(false);
    setLibraryMatches([]);
    setSuggestions([]);
    queryFromUserRef.current = false;
    setQuery(m.name);
    if (onLibrarySelect) onLibrarySelect(m);
    else onChange(m.name);
    isPickingRef.current = false;
  };

  // "Create new" — the ONLY entry into the Google path. Opens a Places session
  // (token logic unchanged) + shows Google matches for the typed name; picking one
  // runs the existing handleSelect (Details → onPlaceSelect → canonical on save).
  const handleCreateNew = () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    setMode('places');
    fetch('/api/places/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: query, sessiontoken: ensureSessionToken() }),
    })
      .then((r) => r.json())
      .then((data) => {
        setSuggestions(data.suggestions ?? []);
        setHighlightedIndex(0);
        setOpen(true);
      })
      .catch(() => setSuggestions([]))
      .finally(() => setLoading(false));
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
          if (!open || totalItems === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, totalItems - 1));
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
          if (e.key === 'Escape') {
            // G1-C keyboard contract — Esc exits the dropdown (does NOT commit),
            // keeping focus on the input so Tab resumes from the expected place.
            e.preventDefault();
            setOpen(false);
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
          if (query.length >= 1) {
            queryFromUserRef.current = true;
            if (totalItems > 0) {
              setOpen(true);
            } else {
              // Re-run the cheap library search (no Places billing on focus).
              setLoading(true);
              setMode('library');
              fetch(`/api/venues/canonical/search?q=${encodeURIComponent(query)}`)
                .then((r) => (r.ok ? r.json() : { venues: [] }))
                .then((data: { venues?: LibraryVenueMatch[] }) => {
                  setLibraryMatches(data.venues ?? []);
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
      {hasDropdown && dropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRefCallback}
            role="listbox"
            className="lp-dropdown-layer fixed max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, minWidth: 240 }}
          >
            {mode === 'library' ? (
              <>
                {libraryMatches.map((m, i) => {
                  const meta = [m.city, m.country].filter(Boolean).join(', ');
                  return (
                    <li key={m.id} role="option" aria-selected={i === highlightedIndex}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleLibrarySelect(m)}
                        onMouseEnter={() => setHighlightedIndex(i)}
                        className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-lp-surface-hover ${i === highlightedIndex ? 'bg-lp-surface-hover' : ''}`}
                      >
                        {/* library-linked marker (orange) */}
                        <span aria-hidden style={{ color: 'var(--lp-orange)', flex: '0 0 auto', lineHeight: 1.2 }}>◆</span>
                        <span className="min-w-0 flex-1 truncate text-lp-text">{m.name}</span>
                        {meta ? <span className="shrink-0 text-xs text-lp-text-tertiary">{meta}{m.capacity ? ` · ${m.capacity.toLocaleString('en-GB')}` : ''}</span> : null}
                      </button>
                    </li>
                  );
                })}
                {/* Create-new — the ONLY entry into the Google Places path. */}
                <li role="option" aria-selected={highlightedIndex === libraryMatches.length}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={handleCreateNew}
                    onMouseEnter={() => setHighlightedIndex(libraryMatches.length)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-lp-text-secondary hover:bg-lp-surface-hover ${highlightedIndex === libraryMatches.length ? 'bg-lp-surface-hover' : ''}`}
                    style={{ borderTop: libraryMatches.length ? '1px solid var(--lp-border)' : undefined }}
                  >
                    <span aria-hidden>＋</span>
                    <span>Create <span className="font-medium text-lp-text">“{query.trim()}”</span> as a new venue</span>
                  </button>
                </li>
              </>
            ) : (
              suggestions.map((s, i) => (
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
              ))
            )}
          </ul>,
          document.body
        )}
    </div>
  );
}
