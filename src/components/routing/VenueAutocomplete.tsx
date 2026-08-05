/* ============================================
   LOWPASS — Venue field with Google Places live search

   As user types, fetches suggestions; on select
   fetches place details and fills address.
   ============================================ */

'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/ui/Toast';
import { focusAdjacentCell } from '@/lib/keyboard/cellNav';

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
  variant = 'boxed',
  ghost = false,
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
  /** R2 ledger — 'ledger' renders the input as borderless 14px/500 text
   *  (mock `.ven`) with an orange inset ring only on focus. The <input> node,
   *  its ref and every handler are IDENTICAL to 'boxed', so KEY-06/07 (Tab
   *  commits FK / free text) are unchanged — pure visual variant. */
  variant?: 'boxed' | 'ledger';
  /** Ledger only — ghost a travel-day venue (dimmer, weight 400) per the mock. */
  ghost?: boolean;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  // Library matches (cheap, no Places billing) — always shown first.
  const [libraryMatches, setLibraryMatches] = useState<LibraryVenueMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // R4b defect 4 — in the ledger the placeholder must only show while EDITING;
  // an unfocused empty cell reads as an en-dash, not the word "Venue" (which
  // scanned as data).
  const [focused, setFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  /* Monotonic search id — a slow library/places response from an earlier
     keystroke must never overwrite a newer one's results. */
  const searchSeqRef = useRef(0);

  /* Tour-builder fix (2026-08-05) — ONE merged list: library matches first
     (◆, no billing), then Google Places suggestions. The old design gated the
     Google search behind a "Create new" row — so with a thin library, typing a
     real venue name produced nothing but an invitation to "add" it, which read
     as search-that-doesn't-search (Adam's exact complaint). Places now runs
     automatically when the library comes back thin; free-text venues still
     work by just typing and Tab/Enter (no FK, per CC_VENUE_SSOT). */
  const totalItems = libraryMatches.length + suggestions.length;
  // Show the popup while a search is in flight too, so a quiet "Searching…" row
  // renders instead of a dead pause (CC_ROUTING_KEYBOARD).
  const hasDropdown = open && query.trim().length >= 1 && (loading || totalItems > 0);

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
      // Open immediately so the "Searching…" row shows while results load.
      if (fromUser) setOpen(true);
      const thisSearch = ++searchSeqRef.current;
      // Library first (cheap, NO Places billing)…
      fetch(`/api/venues/canonical/search?q=${encodeURIComponent(query)}`)
        .then((r) => (r.ok ? r.json() : { venues: [] }))
        .then((data: { venues?: LibraryVenueMatch[] }) => {
          if (thisSearch !== searchSeqRef.current) return; // stale
          const libs = data.venues ?? [];
          setLibraryMatches(libs);
          setHighlightedIndex(0);
          if (fromUser) setOpen(true);
          /* …then Google, AUTOMATICALLY, when the library is thin. No more
             "Create new" gate — the search just searches. Query ≥3 chars keeps
             the very first keystrokes off the metered path; a rich library
             (≥3 hits) short-circuits Google entirely. */
          if (fromUser && libs.length < 3 && query.trim().length >= 3) {
            return fetch('/api/places/autocomplete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ input: query, sessiontoken: ensureSessionToken() }),
            })
              .then((r) => (r.ok ? r.json() : { suggestions: [] }))
              .then((g: { suggestions?: { placeId: string; text: string }[] }) => {
                if (thisSearch !== searchSeqRef.current) return; // stale
                // Drop Google rows that duplicate a library hit by name.
                const libNames = new Set(libs.map((l) => l.name.trim().toLowerCase()));
                setSuggestions(
                  (g.suggestions ?? []).filter(
                    (s) => !libNames.has(s.text.split(',')[0]?.trim().toLowerCase() ?? ''),
                  ),
                );
              });
          }
          setSuggestions([]);
        })
        .catch(() => {
          if (thisSearch === searchSeqRef.current) setLibraryMatches([]);
        })
        .finally(() => {
          if (thisSearch === searchSeqRef.current) setLoading(false);
        });
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

  /** Merged-list pick: library rows first, Google rows after. */
  const selectByIndex = (i: number) => {
    if (i < libraryMatches.length) {
      handleLibrarySelect(libraryMatches[i]);
      return;
    }
    const s = suggestions[i - libraryMatches.length];
    if (s) void handleSelect(s.placeId, s.text);
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

  const listRefCallback = (el: HTMLUListElement | null) => {
    listRef.current = el;
    dropdownRef.current = el;
  };

  return (
    <div ref={containerRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
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
          setFocused(false);
          if (isPickingRef.current) return;
          if (query !== value) {
            onChange(query);
          }
        }}
        onKeyDown={(e) => {
          // CC_ROUTING_KEYBOARD — TAB must ALWAYS exit the cell and move on.
          // If a real result is highlighted, commit it (sets the canonical FK /
          // runs the Places pick); otherwise commit the raw typed text as a
          // free-text venue (FK null, per CC_VENUE_SSOT). Never trap focus.
          if (e.key === 'Tab') {
            const dir: 1 | -1 = e.shiftKey ? -1 : 1;
            if (open && totalItems > 0 && highlightedIndex < totalItems) {
              e.preventDefault();
              selectByIndex(highlightedIndex);
              focusAdjacentCell(inputRef.current, dir);
              return;
            }
            // No results: commit the free text, let native Tab move on.
            if (query !== value) onChange(query);
            setOpen(false);
            return;
          }
          /* Tour-builder fix (2026-08-05) — ENTER commits AND ADVANCES, exactly
             like Tab. It used to select and leave focus sitting in the cell,
             which broke the type → Enter → type rhythm ("enter should select
             the highlight and move to the next entry point"). With no list
             open it commits the typed text and advances, so Enter is never a
             dead key. */
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && totalItems > 0 && highlightedIndex < totalItems) {
              selectByIndex(highlightedIndex);
            } else {
              if (query !== value) onChange(query);
              setOpen(false);
            }
            focusAdjacentCell(inputRef.current, 1);
            return;
          }
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
          if (e.key === 'Escape') {
            // Esc reverts the cell to its previous value + keeps focus, and closes
            // the list in the SAME keypress.
            //
            // R4b defect 2 — it used to take two Escapes. setQuery(value) re-runs
            // the [query] debounce effect, and because queryFromUserRef was still
            // true from typing, that effect called setOpen(true) 250ms later and
            // re-opened the list we had just closed. Cancel the pending debounce
            // and clear the from-user flag so nothing re-opens it.
            e.preventDefault();
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            queryFromUserRef.current = false;
            setQuery(value);
            setOpen(false);
            return;
          }
        }}
        onFocus={(e) => {
          // R4b defect 1 — select the existing text on cell entry so typing
          // REPLACES it. Without this the caret landed at the end and type-to-search
          // appended ("O2 Apollo Manchester" + "man"), which broke the venue search
          // on every already-occupied cell. Standard grid-cell behaviour; Tab-in
          // (KEY-05/06) and click-in both get it.
          e.currentTarget.select();
          setFocused(true);
          if (query.length >= 1) {
            queryFromUserRef.current = true;
            if (totalItems > 0) {
              setOpen(true);
            } else {
              // Re-run the cheap library search (no Places billing on focus).
              setLoading(true);
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
        // R4b defect 4 — ledger cells are text-until-touched, so an UNFOCUSED empty
        // cell shows an en-dash (reads as "no value"); the real placeholder word
        // only appears once you're editing. Boxed variant is unchanged.
        placeholder={variant === 'ledger' && !focused ? '—' : placeholder}
        className={
          variant === 'ledger'
            ? // Ledger — borderless 14px/500 text-until-touched; orange inset ring
              // only on focus. Travel-day venues ghost (dim, weight 400).
              `w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/40 focus:bg-lp-surface ${ghost ? 'font-normal text-lp-text-tertiary' : 'font-medium'}`
            : 'w-full min-w-[120px] rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20'
        }
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
            data-lp-dropdown
            role="listbox"
            className="lp-dropdown-layer fixed max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, minWidth: 240 }}
          >
            {/* ONE merged list: library (◆, free) then Google. Every option is
                tabIndex={-1} — list rows are Enter/click targets, NEVER Tab
                stops; Tab always exits the cell to the next entry point. */}
            {libraryMatches.map((m, i) => {
              const meta = [m.city, m.country].filter(Boolean).join(', ');
              return (
                <li key={m.id} role="option" aria-selected={i === highlightedIndex}>
                  <button
                    type="button"
                    tabIndex={-1}
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
            {suggestions.map((s, i) => {
              const idx = libraryMatches.length + i;
              return (
                <li key={s.placeId} role="option" aria-selected={idx === highlightedIndex}>
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleSelect(s.placeId, s.text)}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm hover:bg-lp-surface-hover ${idx === highlightedIndex ? 'bg-lp-surface-hover' : ''}`}
                    style={i === 0 && libraryMatches.length ? { borderTop: '1px solid var(--lp-border)' } : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate text-lp-text">{s.text}</span>
                    <span className="shrink-0 text-xs text-lp-text-tertiary">Google</span>
                  </button>
                </li>
              );
            })}
            {loading ? (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-lp-text-tertiary" style={{ borderTop: totalItems ? '1px solid var(--lp-border)' : undefined }}>
                Searching…
              </li>
            ) : null}
          </ul>,
          document.body
        )}
    </div>
  );
}
