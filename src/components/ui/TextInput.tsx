'use client';

/* ============================================
   LOWPASS — <TextInput> / <NumberInput> canonical primitives
   (UX Audit 2026 — reference template)

   Replaces the 17+ near-identical inline input clusters
   scattered across the app (the de-facto pattern was
   `border border-lp-border bg-lp-surface px-3 py-2 ...
   focus:border-lp-orange focus:ring-2`). One primitive with
   the label / helper / error / leading-icon / trailing-slot
   structure the skill's Forms rules want:

     - visible label bound via htmlFor/id (skill: form-labels)
     - helper text persistent below (skill: input-helper-text)
     - error below the field + aria (skill: error-placement,
       aria-live-errors)
     - focus-visible ring (skill: focus-states)
     - read-only visually distinct from disabled
       (skill: read-only-distinction)
     - 36px min height (md) → touch-friendly

   Adaptive: uses --lp-* tokens so it themes light/dark.
   For monetary inputs, pass `currencySymbol` to get the
   prefix the §B1.4 CurrencyNumericInput introduced — now
   unified here.
   ============================================ */

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface BaseProps {
  label?: string;
  /** Visually hide the label but keep it for screen readers. */
  hideLabel?: boolean;
  helper?: string;
  error?: string | null;
  size?: Size;
  /** Leading currency/unit symbol rendered inside the field. */
  currencySymbol?: string;
  /** Arbitrary leading node (icon). */
  leading?: ReactNode;
  /** Arbitrary trailing node (icon/button). */
  trailing?: ReactNode;
  containerClassName?: string;
}

export interface TextInputProps
  extends BaseProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {}

const SIZE_CLASS: Record<Size, string> = {
  sm: 'h-7 text-xs',
  md: 'h-9 text-sm',
  lg: 'h-11 text-sm',
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  {
    label,
    hideLabel,
    helper,
    error,
    size = 'md',
    currencySymbol,
    leading,
    trailing,
    containerClassName,
    className,
    id,
    readOnly,
    disabled,
    required,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const helperId = helper ? `${inputId}-helper` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const hasLeading = !!currencySymbol || !!leading;

  return (
    <div className={cn('space-y-1.5', containerClassName)}>
      {label ? (
        <label
          htmlFor={inputId}
          className={cn(
            'block text-[13px] font-medium text-lp-text-secondary',
            hideLabel && 'sr-only',
          )}
        >
          {label}
          {required ? <span className="ml-0.5 text-lp-error">*</span> : null}
        </label>
      ) : null}

      <div className="relative flex items-stretch">
        {hasLeading ? (
          <span
            aria-hidden
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-lp-text-tertiary"
            style={{ fontSize: 'inherit' }}
          >
            {currencySymbol ?? leading}
          </span>
        ) : null}
        <input
          ref={ref}
          id={inputId}
          readOnly={readOnly}
          disabled={disabled}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={cn(helperId, errorId) || undefined}
          className={cn(
            'w-full min-w-0 rounded-lg border bg-lp-surface text-lp-text outline-none',
            'placeholder:text-lp-text-tertiary',
            'transition-colors',
            'focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-0',
            'focus-visible:border-[var(--color-lp-orange)]',
            SIZE_CLASS[size],
            hasLeading ? 'pl-7 pr-3' : 'px-3',
            // read-only: distinct from disabled (muted bg, normal cursor)
            readOnly && 'cursor-default bg-lp-bg-secondary',
            // disabled: reduced emphasis + not-allowed
            disabled && 'cursor-not-allowed opacity-50',
            error
              ? 'border-[var(--color-lp-error)]'
              : 'border-lp-border hover:border-[var(--lp-border-strong)]',
            className,
          )}
          {...rest}
        />
        {trailing ? (
          <span className="absolute right-2 top-1/2 -translate-y-1/2">{trailing}</span>
        ) : null}
      </div>

      {error ? (
        <p id={errorId} role="alert" aria-live="polite" className="text-xs text-lp-error">
          {error}
        </p>
      ) : helper ? (
        <p id={helperId} className="text-xs text-lp-text-tertiary">
          {helper}
        </p>
      ) : null}
    </div>
  );
});

/** Numeric convenience wrapper — coerces onChange to a number
 *  and right-aligns + tabular-nums for data columns
 *  (skill: number-tabular). Pass currencySymbol for money. */
export interface NumberInputProps extends Omit<TextInputProps, 'onChange' | 'value' | 'type'> {
  value: number | string;
  onValueChange?: (next: number) => void;
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { value, onValueChange, className, ...rest },
  ref,
) {
  return (
    <TextInput
      ref={ref}
      type="number"
      value={value}
      onChange={(e) => onValueChange?.(Number(e.target.value) || 0)}
      className={cn('text-right tabular-nums', className)}
      {...rest}
    />
  );
});
