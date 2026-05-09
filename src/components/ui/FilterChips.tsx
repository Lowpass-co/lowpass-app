'use client';

/* ============================================
   LOWPASS — <FilterChips> (Sprint 9 §13.A.10 / Q3)

   Single-select filter chip strip. Reads as one filter row when
   placed alongside the existing inline <FilterSelect> dropdown
   (defined locally in PersonnelManagerClient.tsx for the per-tour
   roster). Visual language matches that surface:
     - lp-text-sm size, lp-bg surface, 1px lp-border-strong stroke
     - active chip swaps to brand orange + lp-text-inverse
     - optional per-chip count rendered as a muted suffix

   API:
     <FilterChips
       options={[{ value: 'all', label: 'All', count: 42 }, …]}
       value={filter}
       onChange={setFilter}
       ariaLabel="Personnel filters"
     />

   The component is generic over a string-literal value type so
   callers retain exhaustive switch checks downstream (the
   PersonnelLibraryClient `FilterKey` union, for example).
   ============================================ */

import type { ReactNode } from 'react';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
  /** Optional pre-computed count rendered as a muted suffix on
      the chip. Pass `undefined` to omit the count badge entirely
      (useful for chips whose set isn't worth pre-counting). */
  count?: number;
  /** Optional leading icon. Sized by the caller. */
  icon?: ReactNode;
  /** Optional title attribute on the chip (tooltip). */
  title?: string;
}

interface FilterChipsProps<T extends string> {
  options: ReadonlyArray<FilterChipOption<T>>;
  value: T;
  onChange: (next: T) => void;
  /** Accessible label for the chip group (rendered on the
      wrapping `<div role="tablist">`). */
  ariaLabel: string;
  /** Optional className extension on the wrapping element. */
  className?: string;
}

export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: FilterChipsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center ${className ?? ''}`.trim()}
      style={{ gap: 'var(--lp-space-2)' }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 6,
              padding: '2px 10px',
              minHeight: 26,
              fontSize: 'var(--lp-text-sm)',
              fontWeight: active
                ? 'var(--lp-weight-semibold)'
                : 'var(--lp-weight-medium)',
              color: active ? 'var(--lp-text-inverse)' : 'var(--lp-text)',
              background: active ? 'var(--color-lp-orange)' : 'var(--lp-bg)',
              border: `1px solid ${active ? 'transparent' : 'var(--lp-border-strong)'}`,
              borderRadius: 'var(--lp-radius-sm)',
              cursor: 'pointer',
              lineHeight: 1.2,
            }}
          >
            {opt.icon ? (
              <span aria-hidden style={{ display: 'inline-flex' }}>
                {opt.icon}
              </span>
            ) : null}
            <span>{opt.label}</span>
            {typeof opt.count === 'number' ? (
              <span
                aria-hidden
                style={{
                  fontSize: 'var(--lp-text-xs)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: active
                    ? 'var(--lp-text-inverse)'
                    : 'var(--lp-text-tertiary)',
                  opacity: active ? 0.85 : 1,
                }}
              >
                {opt.count.toLocaleString()}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
