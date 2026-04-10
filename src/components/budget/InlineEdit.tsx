'use client';

import { cn } from '@/lib/utils';

export interface InlineEditProps {
  /** Current value when in edit mode (controlled). */
  value: string | number;
  /** Called when value changes in edit mode. */
  onChange: (value: string | number) => void;
  /** Whether the cell is in edit mode (show input vs display). */
  isEditing: boolean;
  /** Content to show when not editing. Defaults to value. */
  displayValue?: React.ReactNode;
  type?: 'text' | 'number';
  placeholder?: string;
  /** Applied to the wrapper (td or span). */
  className?: string;
  /** Applied to the input when editing. */
  inputClassName?: string;
  /** Applied to the display when not editing. */
  displayClassName?: string;
  min?: number;
  max?: number;
  step?: string | number;
  /** For number inputs, align display and input right. */
  alignRight?: boolean;
  disabled?: boolean;
}

/**
 * Inline editable cell: shows display content or an input based on isEditing.
 * Uses lp-* design tokens for light/dark. Tailwind only.
 */
export function InlineEdit({
  value,
  onChange,
  isEditing,
  displayValue,
  type = 'text',
  placeholder,
  className,
  inputClassName,
  displayClassName,
  min,
  max,
  step,
  alignRight,
  disabled,
}: InlineEditProps) {
  if (isEditing) {
    return (
      <span className={cn('inline-block w-full', alignRight && 'text-right', className)}>
        <input
          type={type}
          value={value}
          onChange={(e) =>
            onChange(type === 'number' ? (e.target.value === '' ? '' : parseFloat(e.target.value)) : e.target.value)
          }
          placeholder={placeholder}
          disabled={disabled}
          min={min}
          max={max}
          step={step}
          className={cn(
            'rounded border border-lp-border bg-lp-bg px-2 py-1 text-lp-text focus:border-lp-orange focus:outline-none focus:ring-1 focus:ring-lp-orange/20',
            alignRight && 'text-right',
            inputClassName
          )}
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        'text-lp-text',
        alignRight && 'tabular-nums text-right',
        displayClassName,
        className
      )}
    >
      {displayValue !== undefined ? displayValue : String(value)}
    </span>
  );
}
