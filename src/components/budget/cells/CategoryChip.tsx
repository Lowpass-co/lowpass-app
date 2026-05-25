'use client';

/* ============================================
   LOWPASS — <CategoryChip> + <CategoryChipDropdown>
   (Phase B §B3.1)

   Chip render for a budget line item's category. Two
   surfaces:

     <CategoryChip />          read-only chip (label only)
     <CategoryChipDropdown />  chip + popover of options,
                               each rendered as a chip preview

   Background = base color at 10% opacity, border at 40%,
   text at full. Tints derive via color-mix() so the map in
   category-colors.ts stays narrow.

   Legacy categories (values not in the canonical CATEGORY_
   OPTIONS) render with the misc token + a "(custom)" suffix
   in the dropdown so the user sees the row's stored value
   without clobbering it.

   Token-clean: every color via var(--color-lp-cat-*).
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CATEGORY_OPTIONS,
  categoryLabel,
  categoryToken,
  isKnownCategory,
} from '@/lib/budget/category-colors';

interface ChipProps {
  value: string | null | undefined;
  /** Visual size. `sm` for grid / inline; `md` for the
   *  slide-over header. */
  size?: 'sm' | 'md';
  /** Optional className forwarded to the chip span. */
  className?: string;
}

export function CategoryChip({ value, size = 'sm', className }: ChipProps) {
  const token = categoryToken(value);
  const label = categoryLabel(value);
  const px = size === 'md' ? '4px 10px' : '2px 8px';
  const fontSize = size === 'md' ? '12px' : '11px';
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: px,
        fontSize,
        fontWeight: 600,
        letterSpacing: '0.02em',
        borderRadius: 999,
        background: `color-mix(in srgb, var(${token}) 10%, transparent)`,
        border: `1px solid color-mix(in srgb, var(${token}) 40%, transparent)`,
        color: `var(${token})`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

interface DropdownProps {
  value: string;
  onChange: (next: string) => void;
  /** Optional className forwarded to the trigger button. */
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
}

export function CategoryChipDropdown({
  value,
  onChange,
  className,
  size = 'md',
  disabled,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  /* Close on outside click + Escape. Standard pattern from
     ProductHeaderAvatarMenu. */
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* If the row's current value isn't canonical, surface it
     at the top of the dropdown as a "(custom)" option so the
     user can see what they've got without changing it. */
  const currentIsCustom = value && !isKnownCategory(value);
  const options = currentIsCustom
    ? [
        { value, label: `${categoryLabel(value)} (custom)`, token: categoryToken(value) },
        ...CATEGORY_OPTIONS,
      ]
    : CATEGORY_OPTIONS;

  const pick = (next: string) => {
    setOpen(false);
    if (next !== value) onChange(next);
  };

  return (
    <div ref={wrapperRef} className={className} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 0,
          padding: 0,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <CategoryChip value={value} size={size} />
        <ChevronDown
          className="h-3 w-3"
          style={{ color: 'var(--lp-text-tertiary)' }}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute z-50 mt-1 rounded-lg border py-1 shadow-lg"
          style={{
            left: 0,
            minWidth: 180,
            background: 'var(--lp-surface)',
            borderColor: 'var(--lp-border-strong)',
          }}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="menuitem"
              onClick={() => pick(opt.value)}
              className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm"
              style={{
                background: 'transparent',
                color: 'var(--lp-text)',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--lp-surface-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <CategoryChip value={opt.value} size="sm" />
              {opt.value === value ? (
                <span
                  aria-hidden
                  style={{ color: 'var(--color-lp-orange)', fontSize: 12 }}
                >
                  ✓
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
