'use client';

/* ============================================
   <NumberField> — a number input you can actually clear (Oct 2026).

   The bug it fixes (Adam): typing a number then deleting it either snapped
   straight back to the old number (`if (!isNaN) onChange(n)` ignores the
   empty string) or to 0 / 1 (`Number(v) || 0`), so the box could never be
   empty while you typed the next value.

   While the field has focus it shows exactly what you type — including empty.
   Each keystroke that reads as a number is passed up; an empty box is passed
   up as `blank` (0 by default — "a cleared number is 0"; null = pass nothing
   up, keep the old value until something is typed). When the field loses
   focus it shows the value it was given again, and `onCommit` (if any) gets
   the final number.

   `scale` shows a fraction as a percentage (0.15 → 15) and divides on the way
   back. Renders a plain <input> so each caller keeps its own styling.
   ============================================ */

import { forwardRef, useState, type InputHTMLAttributes } from 'react';

export interface NumberFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'defaultValue'> {
  value: number | null | undefined;
  /** Each change that reads as a number (empty → `blank`). */
  onValue?: (n: number) => void;
  /** Once, when the field loses focus, with the final number. */
  onCommit?: (n: number) => void;
  /** What an emptied field means. Default 0; null = nothing until a number is typed. */
  blank?: number | null;
  /** Display multiplier (100 shows 0.15 as 15). */
  scale?: number;
  /** Round what's shown when not editing. */
  decimals?: number;
}

export function readNumber(text: string, blank: number | null, scale: number): number | null {
  const t = text.trim();
  if (t === '') return blank;
  const n = Number(t);
  return Number.isFinite(n) ? n / scale : null;
}

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  { value, onValue, onCommit, blank = 0, scale = 1, decimals, onFocus, onBlur, ...rest },
  ref,
) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = (() => {
    if (draft !== null) return draft;
    if (value === null || value === undefined || !Number.isFinite(value)) return '';
    const v = value * scale;
    return String(decimals === undefined ? +v.toFixed(10) : +v.toFixed(decimals));
  })();
  return (
    <input
      ref={ref}
      type="number"
      {...rest}
      value={shown}
      onFocus={(e) => {
        setDraft(shown);
        onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = readNumber(e.target.value, blank, scale);
        if (n !== null) onValue?.(n);
      }}
      onBlur={(e) => {
        const n = readNumber(e.target.value, blank, scale);
        setDraft(null);
        if (n !== null) onCommit?.(n);
        onBlur?.(e);
      }}
    />
  );
});
