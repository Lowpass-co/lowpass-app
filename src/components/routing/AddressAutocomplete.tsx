'use client';

/* ============================================
   LOWPASS — <AddressAutocomplete> (tour-builder fix, 2026-08-05)

   Address search for days WITHOUT a venue — a day off's hotel, a travel-day
   meeting point. The address field used to be a dead <input>: on a venue-less
   day there was nowhere in the row that could search anything. Adam's call:
   "typing into the address col should still search for addresses."

   A lean sibling of <VenueAutocomplete>: same Places autocomplete + details
   proxy, same session-token billing (one session per lookup, closed by the
   details call), same keyboard contract —

     Tab    commits the highlight (or the free text) and moves to the next cell
     Enter  commits the highlight (or the free text) and moves to the next cell
     ↑/↓    move the highlight; Esc reverts and closes
     list   rows are click/Enter targets, NEVER Tab stops (tabIndex -1)

   On pick it fills address + city/country/coords via onAddressSelect and
   NEVER touches venue_name — an address is not a venue. Free text stays free:
   type anything, Tab/Enter, it commits via onChange exactly like any cell.
   ============================================ */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '@/components/ui/Toast';
import { focusAdjacentCell } from '@/lib/keyboard/cellNav';

export interface AddressResult {
  address: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  place_id?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onAddressSelect,
  placeholder = 'Address',
  className,
  disabled = false,
}: {
  value: string;
  onChange: (address: string) => void;
  /** Fired on a Places pick with the resolved facts. Receiver decides what to
   *  write (address always; city/coords only where sensible). */
  onAddressSelect?: (result: AddressResult) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { showToast } = useToast();
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLUListElement | null>(null);
  const isPickingRef = useRef(false);
  const queryFromUserRef = useRef(false);
  const searchSeqRef = useRef(0);
  const sessionTokenRef = useRef<string | null>(null);
  const ensureSessionToken = () => {
    if (!sessionTokenRef.current) sessionTokenRef.current = crypto.randomUUID();
    return sessionTokenRef.current;
  };

  useEffect(() => {
    setQuery(value);
    queryFromUserRef.current = false;
  }, [value]);

  useEffect(() => {
    if (!queryFromUserRef.current || query.trim().length < 3) {
      setSuggestions([]);
      if (!queryFromUserRef.current) setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const thisSearch = ++searchSeqRef.current;
      setLoading(true);
      setOpen(true);
      fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: query, sessiontoken: ensureSessionToken() }),
      })
        .then((r) => (r.ok ? r.json() : { suggestions: [] }))
        .then((data: { suggestions?: { placeId: string; text: string }[] }) => {
          if (thisSearch !== searchSeqRef.current) return; // stale
          setSuggestions(data.suggestions ?? []);
          setHighlightedIndex(0);
        })
        .catch(() => {
          if (thisSearch === searchSeqRef.current) setSuggestions([]);
        })
        .finally(() => {
          if (thisSearch === searchSeqRef.current) setLoading(false);
        });
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const hasDropdown = open && query.trim().length >= 3 && (loading || suggestions.length > 0);

  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    if (hasDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 280) });
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

  const handleSelect = async (placeId: string, text: string) => {
    isPickingRef.current = true;
    setOpen(false);
    setSuggestions([]);
    queryFromUserRef.current = false;
    const sessiontoken = sessionTokenRef.current;
    sessionTokenRef.current = null; // close the billing session
    try {
      const res = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(placeId)}${sessiontoken ? `&sessiontoken=${encodeURIComponent(sessiontoken)}` : ''}`,
      );
      if (!res.ok) {
        showToast('Could not fetch address details.');
        onChange(text);
        return;
      }
      const d = await res.json();
      const formatted: string =
        typeof d.formattedAddress === 'string' && d.formattedAddress.trim() ? d.formattedAddress : text;
      setQuery(formatted);
      if (onAddressSelect) {
        onAddressSelect({
          address: formatted,
          city: d.inferredCity ?? d.locality,
          country: d.country,
          latitude: d.latitude,
          longitude: d.longitude,
          place_id: placeId,
        });
      } else {
        onChange(formatted);
      }
    } catch {
      showToast('Network error fetching address details.');
      onChange(text);
    } finally {
      isPickingRef.current = false;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          queryFromUserRef.current = true;
          setQuery(e.target.value);
        }}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => {
          if (isPickingRef.current) return;
          if (query !== value) onChange(query);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab') {
            const dir: 1 | -1 = e.shiftKey ? -1 : 1;
            if (open && suggestions[highlightedIndex]) {
              e.preventDefault();
              const s = suggestions[highlightedIndex];
              void handleSelect(s.placeId, s.text);
              focusAdjacentCell(inputRef.current, dir);
              return;
            }
            if (query !== value) onChange(query);
            setOpen(false);
            return;
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            if (open && suggestions[highlightedIndex]) {
              const s = suggestions[highlightedIndex];
              void handleSelect(s.placeId, s.text);
            } else {
              if (query !== value) onChange(query);
              setOpen(false);
            }
            focusAdjacentCell(inputRef.current, 1);
            return;
          }
          if (!open || suggestions.length === 0) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.min(i + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Escape') {
            e.preventDefault();
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
              debounceRef.current = null;
            }
            queryFromUserRef.current = false;
            setQuery(value);
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        className={
          className ??
          'w-full rounded-md border border-lp-border bg-lp-surface px-2.5 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary focus:outline-none focus:border-lp-orange focus:ring-2 focus:ring-lp-orange/30 disabled:opacity-70'
        }
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-lp-text-tertiary">…</span>
      )}
      {hasDropdown && dropdownRect && typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={dropdownRef}
            data-lp-dropdown
            role="listbox"
            className="lp-dropdown-layer fixed max-h-52 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-lg"
            style={{ top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, minWidth: 280 }}
          >
            {suggestions.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === highlightedIndex}>
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(s.placeId, s.text)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={`w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover ${i === highlightedIndex ? 'bg-lp-surface-hover' : ''}`}
                >
                  {s.text}
                </button>
              </li>
            ))}
            {loading ? (
              <li className="px-3 py-2 text-sm text-lp-text-tertiary">Searching…</li>
            ) : null}
          </ul>,
          document.body,
        )}
    </div>
  );
}
