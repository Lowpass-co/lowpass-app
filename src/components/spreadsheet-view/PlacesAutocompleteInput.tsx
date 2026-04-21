'use client';

/**
 * Free-text input with Google Places suggestions (portal dropdown).
 * User can ignore suggestions and keep typing; on pick we resolve place details.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

const DROPDOWN_Z = 5500;

export type PlaceResolvedDetails = {
  displayName: string;
  locality?: string;
  /** Best-effort city from address components (locality, postal_town, etc.). */
  inferredCity?: string | null;
  formattedAddress?: string;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  /**
   * Called only when the user types in the field (not when a suggestion is chosen).
   * Use with hotel name to clear city until a place is picked from the list.
   */
  onTyping?: (value: string) => void;
  /** Called after a suggestion is chosen and details are fetched (optional city fill, etc.). */
  onPlaceResolved?: (details: PlaceResolvedDetails) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Biases Places Autocomplete (e.g. `['lodging']` for hotels, `['locality']` for cities). */
  includedPrimaryTypes?: string[];
  disabled?: boolean;
};

export function PlacesAutocompleteInput({
  value,
  onChange,
  onTyping,
  onPlaceResolved,
  placeholder,
  className,
  inputClassName,
  includedPrimaryTypes,
  disabled,
}: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<{ placeId: string; text: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** Incremented so stale autocomplete responses do not open the list. */
  const fetchGenerationRef = useRef(0);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    setHighlightedIndex((i) => (suggestions.length ? Math.min(i, suggestions.length - 1) : 0));
  }, [suggestions.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list || highlightedIndex < 0) return;
    const item = list.children[highlightedIndex];
    if (item) (item as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [highlightedIndex]);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const gen = ++fetchGenerationRef.current;
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const body: { input: string; includedPrimaryTypes?: string[] } = { input: query };
      if (includedPrimaryTypes?.length) body.includedPrimaryTypes = includedPrimaryTypes;
      fetch('/api/places/autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
        .then((r) => (r.ok ? r.json() : Promise.resolve({ suggestions: [] })))
        .then((data: { suggestions?: { placeId: string; text: string }[] }) => {
          if (gen !== fetchGenerationRef.current) return;
          const sug = data.suggestions ?? [];
          setSuggestions(sug);
          setHighlightedIndex(0);
          const inputEl = inputRef.current;
          const stillFocused = document.activeElement === inputEl;
          if (sug.length > 0 && stillFocused) {
            setOpen(true);
          }
        })
        .catch(() => {
          if (gen !== fetchGenerationRef.current) return;
          setSuggestions([]);
        })
        .finally(() => {
          if (gen === fetchGenerationRef.current) setLoading(false);
        });
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, includedPrimaryTypes]);

  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateDropdownRect = useCallback(() => {
    const input = inputRef.current;
    const rect = input?.getBoundingClientRect();
    if (rect) setDropdownRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    else setDropdownRect(null);
  }, []);

  useLayoutEffect(() => {
    if (open && suggestions.length > 0) updateDropdownRect();
    else setDropdownRect(null);
  }, [open, suggestions.length, updateDropdownRect]);

  useEffect(() => {
    if (!open) return;
    const onScrollOrResize = () => updateDropdownRect();
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, updateDropdownRect]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || listRef.current?.contains(t)) return;
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
    if (s) void handleSelect(s.placeId, s.text);
  };

  const handleSelect = async (placeId: string, text: string) => {
    setOpen(false);
    setSuggestions([]);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(placeId)}`, { signal });
      if (!res.ok) {
        onChange(text);
        return;
      }
      const d = (await res.json()) as {
        displayName?: string;
        formattedAddress?: string;
        locality?: string;
        inferredCity?: string | null;
      };
      const displayName = d.displayName || text;
      onChange(displayName);
      onPlaceResolved?.({
        displayName,
        locality: d.locality,
        inferredCity: d.inferredCity ?? undefined,
        formattedAddress: d.formattedAddress,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      onChange(text);
    }
  };

  const listRefCallback = (el: HTMLUListElement | null) => {
    listRef.current = el;
  };

  return (
    <div ref={containerRef} className={cn('relative min-w-0', className)}>
      <input
        ref={inputRef}
        type="text"
        disabled={disabled}
        value={query}
        onChange={(e) => {
          const v = e.target.value;
          setQuery(v);
          if (onTyping) onTyping(v);
          else onChange(v);
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
          if (e.key === 'Escape') {
            e.preventDefault();
            setOpen(false);
            return;
          }
        }}
        onFocus={() => {
          if (query.length < 2) return;
          setLoading(true);
          const gen = fetchGenerationRef.current;
          const inputForRequest = query;
          const body: { input: string; includedPrimaryTypes?: string[] } = { input: inputForRequest };
          if (includedPrimaryTypes?.length) body.includedPrimaryTypes = includedPrimaryTypes;
          fetch('/api/places/autocomplete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
            .then((r) => (r.ok ? r.json() : Promise.resolve({ suggestions: [] })))
            .then((data: { suggestions?: { placeId: string; text: string }[] }) => {
              if (gen !== fetchGenerationRef.current) return;
              if (inputRef.current?.value !== inputForRequest) return;
              const sug = data.suggestions ?? [];
              setSuggestions(sug);
              setHighlightedIndex(0);
              if (sug.length > 0 && document.activeElement === inputRef.current) {
                setOpen(true);
              }
            })
            .catch(() => {})
            .finally(() => {
              if (gen === fetchGenerationRef.current) setLoading(false);
            });
        }}
        placeholder={placeholder}
        className={cn(
          'w-full min-w-0 rounded-md border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text placeholder:text-lp-text-tertiary',
          'focus:border-lp-orange/50 focus:outline-none focus:ring-1 focus:ring-lp-orange/20',
          'disabled:opacity-50',
          inputClassName
        )}
      />
      {loading && (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-lp-text-tertiary">
          …
        </span>
      )}
      {open &&
        suggestions.length > 0 &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <ul
            ref={listRefCallback}
            role="listbox"
            className="fixed max-h-52 overflow-y-auto rounded-lg border border-lp-border bg-lp-bg py-1 shadow-lg"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: Math.max(dropdownRect.width, 200),
              zIndex: DROPDOWN_Z,
            }}
          >
            {suggestions.map((s, i) => (
              <li key={s.placeId} role="option" aria-selected={i === highlightedIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void handleSelect(s.placeId, s.text)}
                  onMouseEnter={() => setHighlightedIndex(i)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-sm text-lp-text hover:bg-lp-surface-hover',
                    i === highlightedIndex && 'bg-lp-surface-hover'
                  )}
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
