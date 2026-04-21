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

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
    const active =
      (menuRef.current.querySelector('[data-active="true"]') as HTMLButtonElement | null) ||
      (menuRef.current.querySelector('button:not(:disabled)') as HTMLButtonElement | null);
    active?.focus();
  }, [open]);

  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!menuRef.current) return;
    const buttons = Array.from(
      menuRef.current.querySelectorAll('button:not(:disabled)')
    ) as HTMLButtonElement[];
    if (!buttons.length) return;
    const active = document.activeElement as HTMLButtonElement | null;
    const idx = buttons.findIndex((el) => el === active);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(idx + 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(idx - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      buttons[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      buttons[buttons.length - 1]?.focus();
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
          'hover:bg-[var(--lp-surface-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--lp-orange)]/20',
          open && 'ring-2 ring-[var(--lp-orange)]/20',
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
            {options.map((opt) => {
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
