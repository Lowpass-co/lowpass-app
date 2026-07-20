'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { getDayTypeLabel, getDayTypeColor, parseDayTypes } from '@/lib/utils';
import { colourForDayType } from '@/lib/routing/dayType';
import type { DayType } from '@/types';
import { cn } from '@/lib/utils';
import { focusAdjacentCell } from '@/lib/keyboard/cellNav';

const PRESET_DAY_TYPES: DayType[] = [
  'show',
  'off',
  'travel',
  'rehearsal',
  'press',
  'radio',
  'tv',
  'festival',
];

// Must roughly match Tailwind `max-h-64` used on the dropdown layer.
const MAX_DROPDOWN_PX = 256;

function serializeDayTypes(types: string[]): string {
  return types.filter(Boolean).join(', ');
}

export function DayTypeDropdown({
  value,
  onChange,
  customTypes = [],
  variant = 'boxed',
}: {
  value: string;
  onChange: (value: string) => void;
  customTypes?: string[];
  /** R2 ledger — 'ledger' renders the closed trigger as borderless text (colour
   *  dot + label, mock `.dt`) that only shows the orange focus ring on focus.
   *  The button, its handlers and DOM position are IDENTICAL to 'boxed', so the
   *  keyboard contract (KEY-04..07 native Tab-order + arrows-in-place) is
   *  unchanged — this is a pure visual variant. */
  variant?: 'boxed' | 'ledger';
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropdownRect, setDropdownRect] = useState<
    { top: number; left: number; width: number; flipUp: boolean } | null
  >(null);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = parseDayTypes(value);
  const allTypes = [...PRESET_DAY_TYPES, ...customTypes.filter((c) => !PRESET_DAY_TYPES.includes(c as DayType))];

  // CC_ROUTING_KEYBOARD — ↑/↓ on the CLOSED cell change the day type IN PLACE
  // (cycling the type list, replacing the value with a single type) WITHOUT
  // opening a popup. This is Adam's core flow: click a row → arrows change the
  // day type → Tab to the venue. Multi-type stays available via the popup.
  const cyclePrimary = (dir: 1 | -1) => {
    if (allTypes.length === 0) return;
    const primary = selected[0];
    const at = primary ? allTypes.indexOf(primary) : (dir === 1 ? -1 : 0);
    const idx = ((at + dir) % allTypes.length + allTypes.length) % allTypes.length;
    onChange(allTypes[idx]);
  };

  // VIS-TR-06 — type-searchable: filter the type list by label or value.
  const q = query.trim().toLowerCase();
  const filtered = q
    ? allTypes.filter(
        (t) => getDayTypeLabel(t).toLowerCase().includes(q) || t.toLowerCase().includes(q),
      )
    : allTypes;

  // Open/close helper — resets the search + keyboard cursor here (not in an
  // effect) so there's no setState-in-effect. `seed` lets type-ahead open with
  // the first character already in the box.
  const setMenu = (next: boolean, seed?: string) => {
    if (next) {
      setQuery(seed ?? '');
      setActiveIndex(0);
    } else {
      setQuery('');
    }
    setOpen(next);
  };

  // Focus the search box when the portal opens so the cell is immediately
  // type-searchable. Focus only — no state writes.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      const downTop = rect.bottom + 4;
      const spaceBelow = window.innerHeight - downTop;

      // Flip when the dropdown can't fully fit downward. When flipping, we anchor the
      // dropdown's *bottom* to the select by using `translateY(-100%)` (no gap).
      const shouldFlipUp = spaceBelow < MAX_DROPDOWN_PX && rect.top - 4 > 8;

      setDropdownRect({
        top: shouldFlipUp ? rect.top - 4 : downTop,
        left: rect.left,
        width: rect.width,
        flipUp: shouldFlipUp,
      });
    } else {
      setDropdownRect(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (ref.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setMenu(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = (type: string) => {
    const next = selected.includes(type)
      ? selected.filter((t) => t !== type)
      : [...selected, type];
    onChange(serializeDayTypes(next));
  };

  const summary =
    selected.length === 0
      ? 'Select day type'
      : selected.length <= 2
        ? selected.map((t) => getDayTypeLabel(t)).join(', ')
        : `${selected.length} types`;

  const isLedger = variant === 'ledger';
  const primaryColour = selected[0] ? colourForDayType(selected[0]) : null;

  return (
    <div className={cn('relative', isLedger ? 'w-full' : 'min-w-[140px]')} ref={ref}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenu(!open)}
        onKeyDown={(e) => {
          if (open) return; // arrows/typing handled by the search box while open
          // ↑/↓ change the day type in place (no popup). Alt+↓ opens the full list.
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (e.altKey && e.key === 'ArrowDown') { setMenu(true); return; }
            cyclePrimary(e.key === 'ArrowDown' ? 1 : -1);
            return;
          }
          // Tab is NEVER swallowed — native Tab moves to the next cell (venue).
          if (e.key === 'Tab') return;
          // VIS-TR-06 — type-ahead: start typing to open + seed the search.
          if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            setMenu(true, e.key);
          }
        }}
        className={
          isLedger
            ? cn(
                // Ledger: borderless text-until-touched. Orange inset ring only on
                // focus (G2-2b cursor treatment); hover/open hints a faint surface.
                'flex w-full items-center gap-1.5 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-left text-xs transition-all duration-150',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange/60 focus-visible:border-lp-orange',
                open && 'ring-2 ring-lp-orange/40 border-lp-orange',
              )
            : cn(
                'flex h-9 w-full items-center justify-between gap-2 rounded-xl border bg-lp-surface px-3 py-2 text-left text-sm transition-all duration-150',
                open && 'ring-2 ring-lp-orange/20',
                'border-lp-border focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20',
              )
        }
      >
        {isLedger ? (
          <>
            {primaryColour ? (
              <span
                aria-hidden
                className="inline-block shrink-0 rounded-full"
                style={{ width: 7, height: 7, background: primaryColour }}
              />
            ) : null}
            <span className={cn('truncate', selected.length === 0 && 'text-lp-text-tertiary')}>
              {selected.length === 0 ? '—' : summary}
            </span>
          </>
        ) : (
          <>
            <span className={cn('truncate', selected.length === 0 && 'text-lp-text-tertiary')}>
              {summary}
            </span>
            <ChevronDown size={14} className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-150', open && 'rotate-180')} />
          </>
        )}
      </button>
      {open &&
        dropdownRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            data-lp-dropdown
            // Sprint 8.2 §4 — dropped the inline `z-[70]` Tailwind
            // class. It overrode `lp-dropdown-layer`'s z-index
            // (now 1300) and forced the dropdown behind any
            // slide-over (z-index 1210). lp-dropdown-layer alone
            // is the right layer.
            className="lp-dropdown-layer fixed max-h-64 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-2 shadow-xl"
            style={{
              top: dropdownRect.top,
              left: dropdownRect.left,
              width: dropdownRect.width,
              minWidth: 140,
              transform: dropdownRect.flipUp ? 'translateY(-100%)' : undefined,
              transformOrigin: 'top',
            }}
          >
            {/* VIS-TR-06 — type-search box + keyboard nav (↑/↓ move, Enter toggles,
                Esc closes). Click still toggles any pill directly. */}
            <div className="px-2 pb-2">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setActiveIndex((i) => Math.max(i - 1, 0));
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    const t = filtered[activeIndex];
                    if (t) toggle(t);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setMenu(false);
                    triggerRef.current?.focus();
                  } else if (e.key === 'Tab') {
                    // Never trap Tab inside the portal: commit the highlighted
                    // type (if type-searching), close, and move to the adjacent
                    // cell relative to the trigger (not the portal).
                    e.preventDefault();
                    const t = filtered[activeIndex];
                    if (t && query.trim()) toggle(t);
                    setMenu(false);
                    focusAdjacentCell(triggerRef.current, e.shiftKey ? -1 : 1);
                  }
                }}
                placeholder="Type to filter…"
                aria-label="Filter day types"
                className="w-full rounded-lg border border-lp-border bg-lp-bg-secondary px-2.5 py-1.5 text-xs text-lp-text placeholder:text-lp-text-tertiary focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
              />
            </div>
            <div className="flex flex-wrap gap-1.5 px-2">
              {filtered.length === 0 ? (
                <span className="px-1 py-1 text-xs text-lp-text-tertiary">No matching types</span>
              ) : (
                filtered.map((type, i) => {
                  const isSelected = selected.includes(type);
                  const isActive = i === activeIndex;
                  const colors = getDayTypeColor(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggle(type)}
                      onMouseEnter={() => setActiveIndex(i)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium cursor-pointer transition-all duration-200',
                        isSelected
                          ? [colors.bg, colors.text, 'ring-2 ring-lp-accent/50 border-transparent']
                          : 'bg-lp-surface-hover text-lp-text-secondary border border-lp-border hover:border-lp-border-light',
                        isActive && !isSelected && 'ring-2 ring-lp-orange/40',
                      )}
                    >
                      {getDayTypeLabel(type)}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
