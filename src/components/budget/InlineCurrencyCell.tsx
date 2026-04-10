'use client';

import { cn } from '@/lib/utils';

export interface InlineCurrencyCellProps {
  /** Raw numeric value. Uses Number(value) || 0 for display and input (intentional pattern). */
  value: number | null | undefined;
  /** Called with the new number when user changes the value in edit mode. */
  onChange: (value: number | null) => void;
  /** Whether the cell is in edit mode. */
  isEditing: boolean;
  /** Optional class for the wrapper. */
  className?: string;
  /** Optional class for the input. */
  inputClassName?: string;
  /** Optional class for the display (read-only) value. */
  displayClassName?: string;
  /** Optional: show in red (e.g. converted home currency). */
  variant?: 'default' | 'converted';
  disabled?: boolean;
}

const CURRENCY_FORMAT: Intl.NumberFormatOptions = {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
};

/**
 * Inline editable currency cell. Display shows formatted number; edit mode shows number input.
 * Uses Number() || 0 intentionally — do not change to ?? 0.
 * Uses lp-* tokens for light/dark. Tailwind only.
 */
export function InlineCurrencyCell({
  value,
  onChange,
  isEditing,
  className,
  inputClassName,
  displayClassName,
  variant = 'default',
  disabled,
}: InlineCurrencyCellProps) {
  const num = value == null ? null : Number(value);

  if (isEditing) {
    return (
      <span className={cn('inline-block w-full text-right', className)}>
        <input
          type="number"
          step="0.01"
          value={num ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? null : parseFloat(e.target.value))}
          disabled={disabled}
          className={cn(
            'rounded border border-lp-border bg-lp-bg px-2 py-1 text-right text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/20',
            inputClassName
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'tabular-nums text-right text-lp-text',
        variant === 'converted' && 'text-red-600 dark:text-red-400',
        displayClassName,
        className
      )}
    >
      {(num ?? 0).toLocaleString('en-GB', CURRENCY_FORMAT)}
    </span>
  );
}
