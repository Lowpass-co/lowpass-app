/* ============================================
   LOWPASS — InlineSelectCell (shared custom dropdown)

   The budget's custom select: a trigger + a fixed-positioned popover
   listbox (tone dot + check on the current value), keyboard-accessible,
   closing on outside-click / Escape / scroll. Extracted from the grid
   so the line-item slide-over can use the SAME control (BUD-04) instead
   of native <select>s.

   Two triggers via `variant`:
     - 'chip'  (default) — the caller's `children` is the trigger
       (the grid's coloured status / phase chip).
     - 'field' — a full-width bordered control showing the selected
       option label + a chevron (form fields in the slide-over).

   Token-clean.
   ============================================ */

'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/* Per-option tone dot, keyed by value. Status tones mirror the status
   chips; phase tones mirror the day-type tokens. Unknown values (e.g.
   section ids, currencies) get a neutral dot. */
export const OPTION_TONE: Record<string, string> = {
  draft: 'var(--color-lp-status-not-started)',
  quoted: 'var(--color-lp-status-in-progress)',
  approved: 'var(--color-lp-status-complete)',
  paid: 'var(--color-lp-status-complete)',
  disputed: 'var(--color-lp-status-needs-review)',
  pre_prod: 'var(--color-lp-day-travel)',
  rehearsals: 'var(--color-lp-day-radio)',
  show_days: 'var(--color-lp-orange)',
  wrap: 'var(--lp-text-tertiary)',
};

export function InlineSelectCell({
  value,
  options,
  onCommit,
  ariaLabel,
  readOnly = false,
  children,
  variant = 'chip',
  placeholder = 'Select…',
  showTone = true,
}: {
  value: string;
  options: SelectOption[];
  onCommit: (next: string) => void;
  ariaLabel: string;
  readOnly?: boolean;
  /** Trigger content for the 'chip' variant (the coloured chip). */
  children?: React.ReactNode;
  variant?: 'chip' | 'field';
  /** 'field' variant text when no option is selected. */
  placeholder?: string;
  /** Render the per-option tone dot (off for plain lists like currency). */
  showTone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectable = options.filter((o) => !o.disabled);
  const selectedLabel = options.find((o) => o.value === value)?.label ?? '';

  const closeMenu = () => {
    setOpen(false);
    setActiveIndex(-1);
  };

  const openMenu = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 150),
      });
    }
    const idx = selectable.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
    setOpen(true);
  };

  const choose = (next: string) => {
    onCommit(next);
    closeMenu();
    buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const dismiss = () => closeMenu();
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [open]);

  useEffect(() => {
    if (open && menuRef.current) menuRef.current.focus();
  }, [open]);

  if (readOnly) return <>{children}</>;

  const fieldTriggerStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    width: '100%',
    border: '1px solid var(--lp-border)',
    background: 'var(--lp-surface)',
    color: 'var(--lp-text)',
    borderRadius: 'var(--lp-radius-md)',
    padding: 'var(--lp-space-2) var(--lp-space-3)',
    fontSize: 'var(--lp-text-base)',
    cursor: 'pointer',
    outline: 'none',
  };
  const chipTriggerStyle: React.CSSProperties = {
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 999,
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title="Click to edit"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openMenu();
          }
        }}
        className="btn-transition"
        style={variant === 'field' ? fieldTriggerStyle : chipTriggerStyle}
      >
        {variant === 'field' ? (
          <>
            <span
              className="min-w-0 flex-1 truncate text-left"
              style={{
                color: selectedLabel ? 'var(--lp-text)' : 'var(--lp-text-tertiary)',
              }}
            >
              {selectedLabel || placeholder}
            </span>
            <ChevronDown
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--lp-text-tertiary)' }}
              aria-hidden
            />
          </>
        ) : (
          children
        )}
      </button>
      {open && coords ? (
        <div
          ref={menuRef}
          role="listbox"
          aria-label={ariaLabel}
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              closeMenu();
              buttonRef.current?.focus();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % selectable.length);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + selectable.length) % selectable.length);
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              const opt = selectable[activeIndex];
              if (opt) choose(opt.value);
            }
          }}
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            minWidth: coords.width,
            maxHeight: 280,
            overflowY: 'auto',
            zIndex: 50,
            background: 'var(--lp-surface)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 8,
            boxShadow: 'var(--lp-shadow-popover)',
            padding: 4,
            outline: 'none',
          }}
        >
          {selectable.map((o, idx) => {
            const isSelected = o.value === value;
            const isActive = idx === activeIndex;
            const tone = OPTION_TONE[o.value];
            return (
              <button
                key={o.value || 'empty'}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => choose(o.value)}
                onMouseEnter={() => setActiveIndex(idx)}
                className="btn-transition"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  fontSize: '12px',
                  fontWeight: isSelected ? 600 : 500,
                  padding: '5px 8px',
                  borderRadius: 5,
                  border: 0,
                  cursor: 'pointer',
                  background: isActive
                    ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                    : 'transparent',
                  color: isActive ? 'var(--color-lp-orange)' : 'var(--lp-text)',
                }}
              >
                {showTone ? (
                  <span
                    aria-hidden
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ background: tone ?? 'var(--lp-border-strong)' }}
                  />
                ) : null}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {isSelected ? (
                  <Check
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: 'var(--color-lp-orange)' }}
                    aria-hidden
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </>
  );
}
