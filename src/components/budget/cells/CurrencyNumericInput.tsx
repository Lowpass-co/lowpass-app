'use client';

/* ============================================
   LOWPASS — <CurrencyNumericInput> (Phase B §B1.4)

   Thin wrapper around <input type="number"> that renders a
   non-editable currency-symbol prefix inside the field. Used
   by the slide-over (ESTIMATED, ACTUAL) and the transactions
   editor (Amount) so every monetary input shows the symbol
   without the caller hand-rolling a prefix span each time.

   Quantity inputs are NOT monetary — keep using plain
   <input> there.

   Token-clean: prefix text via var(--lp-text-secondary); the
   underlying input is styled by the caller (we forward
   `style` + `className`).
   ============================================ */

import type { CSSProperties } from 'react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';

interface Props {
  value: number | string;
  onChange: (next: number) => void;
  currency: string;
  /** Forwarded to the inner input. */
  style?: CSSProperties;
  /** Forwarded to the inner input. */
  className?: string;
  step?: number | string;
  min?: number | string;
  placeholder?: string;
  ariaLabel?: string;
  /** Forwarded to the input for inline-edit commit-on-blur
   *  workflows. */
  onBlur?: () => void;
  onFocus?: () => void;
  autoFocus?: boolean;
}

export function CurrencyNumericInput({
  value,
  onChange,
  currency,
  style,
  className,
  step = '0.01',
  min,
  placeholder,
  ariaLabel,
  onBlur,
  onFocus,
  autoFocus,
}: Props) {
  const symbol = budgetCurrencySymbol(currency);
  return (
    <span
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'stretch',
        width: '100%',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          left: 8,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--lp-text-secondary)',
          fontSize: 'inherit',
          pointerEvents: 'none',
          /* Narrow currency symbols (£, $, €) sit one char
             wide; longer ones like CHF/SEK push the padding
             reservation up. Use a min-width of 1.25ch + the
             symbol's natural width. */
          minWidth: '1ch',
        }}
      >
        {symbol}
      </span>
      <input
        type="number"
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        onBlur={onBlur}
        onFocus={onFocus}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        style={{
          ...style,
          /* Reserve room for the prefix on the left. The
             prefix's max realistic width is ~3ch (CHF, SEK)
             plus the 8px left offset + a bit of breathing
             room. 2.5rem covers it comfortably. */
          paddingLeft: '2.5rem',
        }}
      />
    </span>
  );
}
