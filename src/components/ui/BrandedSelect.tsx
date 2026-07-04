/* ============================================
   LOWPASS — BrandedSelect

   Portaled single-select dropdown that matches the Lowpass design
   language (see DESIGN_REFERENCES.md). Use this instead of native
   <select> anywhere the control is part of a branded surface.

   Pattern mirrors DayTypeDropdown (routing) but single-select:
     - Rounded-xl trigger with chevron-down rotation.
     - Portaled menu on .lp-dropdown-layer so it renders above
       sidebar, header, and card stacking contexts.
     - Keyboard navigation: ArrowUp / ArrowDown / Enter / Esc.
     - Outside-click + Escape close.
     - Flips upward when there's not enough room below.
     - Optional leading color dot per option (for status/severity
       pickers so the menu matches the Pill component).
   ============================================ */

'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type BrandedSelectOption = {
  value: string;
  label: string;
  /** Optional color dot shown before the label (hex or css color). */
  color?: string;
};

const MAX_DROPDOWN_PX = 320;

export function BrandedSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className,
  triggerClassName,
  ariaLabel,
  disabled = false,
  minWidth = 160,
  size = 'md',
  autoOpen = false,
  onOpenChange,
  filterable = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: BrandedSelectOption[];
  placeholder?: string;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
  disabled?: boolean;
  minWidth?: number;
  /** 'sm' = compact (h-8, text-xs) for inline-edit cells. */
  size?: 'sm' | 'md';
  /** Open immediately on mount. Use for inline-edit cells that replace
   *  a native <select> where the user has already clicked through to edit. */
  autoOpen?: boolean;
  /** Notified when the dropdown opens or closes. Useful for parents that
   *  need to detect "user dismissed without picking" (cancel). */
  onOpenChange?: (open: boolean) => void;
  /** Sprint 12 §8b4 — opt-in type-to-filter mode for dropdowns
   *  with long option lists (e.g. the mic library ~100 entries).
   *  When true, the open dropdown captures letter / digit
   *  keypresses as filter text; Backspace chops one char;
   *  Escape clears the filter AND closes (the close happens
   *  via the existing document-level Escape handler). The
   *  filter chip renders at the top of the dropdown so the
   *  user sees what they've typed.
   *
   *  Default false — preserves the existing behaviour for the
   *  30 other mounts across the app. */
  filterable?: boolean;
}) {
  const [open, setOpenState] = useState(autoOpen);
  const setOpen = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOpenState((prev) => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (resolved !== prev) onOpenChange?.(resolved);
        return resolved;
      });
    },
    [onOpenChange]
  );
  const [rect, setRect] = useState<
    { top: number; left: number; width: number; flipUp: boolean } | null
  >(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const current = options.find((o) => o.value === value);

  /* Sprint 12 §8b4 — filter state. Only consulted when
     `filterable` is true and the dropdown is open. Resets to
     empty string whenever the dropdown closes so the next
     open starts fresh. */
  const [filter, setFilter] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived state reset on open→close (no infinite loop: setFilter is a no-op when filter is already '')
    if (!open) setFilter('');
  }, [open]);

  const visibleOptions = useMemo(() => {
    if (!filterable || !filter) return options;
    const needle = filter.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(needle));
  }, [filterable, filter, options]);

  const close = useCallback(() => setOpen(false), [setOpen]);

  useLayoutEffect(() => {
    if (open && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect();
      const downTop = r.bottom + 4;
      const spaceBelow = window.innerHeight - downTop;
      const shouldFlipUp = spaceBelow < MAX_DROPDOWN_PX && r.top - 4 > 8;
      setRect({
        top: shouldFlipUp ? r.top - 4 : downTop,
        left: r.left,
        width: Math.max(r.width, minWidth),
        flipUp: shouldFlipUp,
      });
    } else {
      setRect(null);
    }
  }, [open, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  useEffect(() => {
    if (!open || !menuRef.current) return;
    /* When filtering, the previously-focused option may have
       dropped out of view — jump to the first visible match.
       When NOT filtering, the existing behaviour (focus
       selected option, else first option) holds. The
       `filter` dependency makes this fire on every filter
       keystroke. */
    const active = filter
      ? (menuRef.current.querySelector('button:not(:disabled)') as HTMLButtonElement | null)
      : (menuRef.current.querySelector('[data-active="true"]') as HTMLButtonElement | null) ||
        (menuRef.current.querySelector('button:not(:disabled)') as HTMLButtonElement | null);
    active?.focus();
  }, [open, filter]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current) return;
    const buttons = Array.from(
      menuRef.current.querySelectorAll('button:not(:disabled)')
    ) as HTMLButtonElement[];
    /* Arrow / Home / End run even when buttons.length === 0
       (no-op) — but the early return above made them skip.
       Move the length check inside the navigation branches so
       filter keys still work on an empty result set. */
    const active = document.activeElement as HTMLButtonElement | null;
    const idx = buttons.findIndex((el) => el === active);
    if (e.key === 'ArrowDown') {
      if (!buttons.length) return;
      e.preventDefault();
      buttons[(idx + 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      if (!buttons.length) return;
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Home') {
      if (!buttons.length) return;
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      if (!buttons.length) return;
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
    } else if (filterable) {
      /* Sprint 12 §8b4 — filter capture. Single-character
         printable keys append to the filter; Backspace chops
         one char. Escape is handled by the document-level
         listener (clears + closes via the existing close()).
         Modifier-key presses (Ctrl/Meta/Alt) are passed
         through so OS shortcuts still work. */
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Backspace') {
        if (filter.length === 0) return;
        e.preventDefault();
        setFilter((f) => f.slice(0, -1));
      } else if (e.key.length === 1 && /\S/.test(e.key)) {
        /* Only intercept printable chars (length 1 catches
           letters, digits, punctuation). The /\S/ guard
           rejects spaces from starting the filter but allows
           them mid-filter — handled below. */
        e.preventDefault();
        setFilter((f) => f + e.key);
      } else if (e.key === ' ' && filter.length > 0) {
        /* Allow space inside an already-started filter so
           "she 5" matches "Shure KSM5". */
        e.preventDefault();
        setFilter((f) => f + ' ');
      }
    }
  };

  return (
    <div className={cn('relative inline-block', className)} ref={wrapRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          } else if (
            filterable &&
            !open &&
            e.key.length === 1 &&
            /\S/.test(e.key) &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey
          ) {
            /* Type-to-search parity with the mic combobox: a printable key on
               the CLOSED trigger opens the menu and seeds the filter with that
               char, so the operator types straight into the cell to narrow the
               list (rather than open-then-type). Only when `filterable`. */
            e.preventDefault();
            setFilter(e.key);
            setOpen(true);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'inline-flex w-full items-center justify-between gap-2 text-left transition-colors duration-150',
          size === 'sm'
            ? 'h-8 rounded-lg px-2 py-1 text-xs'
            : 'h-9 rounded-xl px-3 py-2 text-sm',
          'border border-[var(--lp-border)] bg-[var(--lp-bg-secondary)] text-[var(--lp-text)]',
          'hover:bg-[var(--lp-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]',
          open && 'ring-2 ring-inset ring-[var(--color-lp-orange)]/40',
          disabled && 'cursor-not-allowed opacity-50',
          triggerClassName
        )}
        style={{ minWidth }}
      >
        <span className="flex min-w-0 items-center gap-2">
          {current?.color && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: current.color }}
            />
          )}
          <span
            className={cn(
              'truncate',
              !current && 'text-[var(--lp-text-tertiary)]'
            )}
          >
            {current?.label ?? placeholder}
          </span>
        </span>
        <ChevronDown
          size={14}
          className={cn(
            'shrink-0 text-[var(--lp-text-tertiary)] transition-transform duration-150',
            open && 'rotate-180'
          )}
        />
      </button>

      {open &&
        rect &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className="lp-dropdown-layer fixed max-h-80 overflow-y-auto rounded-xl border border-[var(--lp-border)] bg-[var(--lp-surface)] py-1 shadow-xl animate-scale-in"
            style={{
              top: rect.top,
              left: rect.left,
              width: rect.width,
              minWidth,
              transform: rect.flipUp ? 'translateY(-100%)' : undefined,
              transformOrigin: rect.flipUp ? 'bottom' : 'top',
            }}
          >
            {filterable && filter ? (
              <div
                className="border-b px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  borderColor: 'var(--lp-border)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Filter: <span style={{ color: 'var(--lp-text)' }}>{filter}</span>
                <span className="ml-2 text-[var(--lp-text-tertiary)]">
                  ({visibleOptions.length})
                </span>
              </div>
            ) : null}
            {visibleOptions.length === 0 ? (
              <div
                className="px-3 py-2 text-xs italic"
                style={{ color: 'var(--lp-text-tertiary)' }}
              >
                No matches.
              </div>
            ) : null}
            {visibleOptions.map((opt) => {
              const selected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-active={selected ? 'true' : undefined}
                  onClick={() => {
                    onChange(opt.value);
                    close();
                  }}
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors',
                    'text-[var(--lp-text)] hover:bg-[var(--lp-surface-hover)]',
                    selected && 'bg-[var(--lp-surface-hover)]'
                  )}
                >
                  {opt.color && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: opt.color }}
                    />
                  )}
                  <span className="flex-1 truncate">{opt.label}</span>
                  {selected && (
                    <Check
                      size={14}
                      className="shrink-0 text-[var(--lp-orange)]"
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
