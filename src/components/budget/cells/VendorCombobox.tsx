'use client';

/* ============================================
   LOWPASS — <VendorCombobox> (Phase B §B3.2)

   Text input + autocomplete popover for the transaction
   Vendor field. Sources:

     1. defaultVendor (parent line item's vendor, if any) —
        surfaces at the top of the dropdown so the user can
        one-click match the parent.
     2. Workspace vendor history from
        /api/budget/vendor-history — most-used first, capped
        at 50 entries.

   Behaviour:
     - Free-text typing always allowed; combobox is non-modal.
     - Dropdown opens on focus + when the user starts typing.
     - Typing filters the list (case-insensitive substring).
     - Arrow up/down navigates highlighted option.
     - Enter or click commits the highlighted option.
     - Escape closes the dropdown without committing.

   Backwards-compat: existing transactions with arbitrary
   vendor strings render fine — the input shows the stored
   value verbatim. The dropdown is opt-in via focus / type.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  /** Parent line item's vendor (extracted from notes "Vendor:
   *  <name>" prefix). Surfaces at the top of the dropdown.
   *  Empty string when the parent has no vendor. */
  defaultVendor?: string;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  /** Fired when the user commits a value: Enter, option
   *  click, or blur away. The argument is the committed
   *  string (passed explicitly so callers don't see stale
   *  closure on option-pick, where setState is async). */
  onCommit?: (next: string) => void;
  onCancel?: () => void;
}

let cachedFetch: Promise<string[]> | null = null;
async function fetchVendorHistory(): Promise<string[]> {
  /* Module-level memoisation. The server-side cache makes
     the call cheap, but multiple combobox instances on the
     same page (one per transaction row + the slide-over)
     would otherwise each fire on first mount. Cache for the
     life of the page; refetch on every reload via the route
     itself. */
  if (cachedFetch) return cachedFetch;
  cachedFetch = (async () => {
    try {
      const res = await fetch('/api/budget/vendor-history');
      if (!res.ok) return [];
      const json = (await res.json().catch(() => ({}))) as { vendors?: string[] };
      return Array.isArray(json.vendors) ? json.vendors : [];
    } catch {
      return [];
    }
  })();
  return cachedFetch;
}

export function VendorCombobox({
  value,
  onChange,
  defaultVendor,
  placeholder,
  className,
  ariaLabel,
  onCommit,
  onCancel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    void fetchVendorHistory().then(setHistory);
  }, [open]);

  /* Outside-click + Escape close. */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  /* Build the candidate list: parent vendor first (when
     distinct from the current value), then filtered history. */
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ label: string; source: 'parent' | 'history' }> = [];
    const dv = (defaultVendor ?? '').trim();
    if (dv && dv !== value) {
      out.push({ label: dv, source: 'parent' });
      seen.add(dv.toLowerCase());
    }
    const q = value.trim().toLowerCase();
    for (const h of history) {
      const key = h.toLowerCase();
      if (seen.has(key)) continue;
      if (q && !key.includes(q)) continue;
      out.push({ label: h, source: 'history' });
      seen.add(key);
    }
    return out;
  }, [value, history, defaultVendor]);

  /* Clamp highlight without an effect (avoids the
     set-state-in-effect lint precedent). */
  const safeHighlight = candidates.length === 0
    ? 0
    : Math.min(highlight, candidates.length - 1);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      onCommit?.(next);
    },
    [onChange, onCommit],
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        setHighlight((h) => Math.min(h + 1, candidates.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        if (open && candidates[safeHighlight]) {
          e.preventDefault();
          commit(candidates[safeHighlight].label);
          return;
        }
        setOpen(false);
        onCommit?.(value);
        return;
      }
      if (e.key === 'Escape') {
        if (open) {
          setOpen(false);
          return;
        }
        onCancel?.();
      }
    },
    [open, candidates, safeHighlight, commit, onCommit, onCancel, value],
  );

  return (
    <div
      ref={wrapperRef}
      className={className}
      style={{ position: 'relative', width: '100%' }}
    >
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={(e) => {
          /* Fire onCommit on blur unless focus moved INTO the
             dropdown (option click). Option onMouseDown calls
             preventDefault so the input never blurs in that
             case — when blur fires here, focus is leaving
             the combobox entirely, so commit the current
             typed value. */
          const next = e.relatedTarget as Node | null;
          if (next && wrapperRef.current?.contains(next)) return;
          setOpen(false);
          onCommit?.(value);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        role="combobox"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="vendor-combobox-options"
        autoComplete="off"
        className="min-w-0 w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm text-lp-text outline-none hover:border-lp-border focus:border-lp-orange/40 focus:bg-lp-surface"
      />
      {open && candidates.length > 0 ? (
        <ul
          id="vendor-combobox-options"
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 overflow-y-auto rounded-lg border py-1 shadow-lg"
          style={{
            left: 0,
            right: 0,
            background: 'var(--lp-surface)',
            borderColor: 'var(--lp-border-strong)',
          }}
        >
          {candidates.map((c, idx) => {
            const active = idx === safeHighlight;
            return (
              <li
                key={`${c.source}:${c.label}`}
                role="option"
                aria-selected={active}
                onMouseDown={(e) => {
                  /* Mousedown not click — fires before the
                     input's blur, so commit happens before
                     the outside-click handler closes the
                     dropdown. */
                  e.preventDefault();
                  commit(c.label);
                }}
                onMouseEnter={() => setHighlight(idx)}
                className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm cursor-pointer"
                style={{
                  background: active ? 'var(--lp-surface-hover)' : 'transparent',
                  color: 'var(--lp-text)',
                }}
              >
                <span className="truncate">{c.label}</span>
                {c.source === 'parent' ? (
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--lp-text-tertiary)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    From line
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
