'use client';

/* ============================================
   LOWPASS — <BudgetCellInput> (Phase B §B1.2)

   Inline edit primitive for the Budget grid's monetary cells
   (Proposed, Actual). Renders the value as plain text by
   default; clicking enters edit mode with a focused numeric
   input. Commits on Enter / Tab / blur; reverts on Escape.

   Shape mirrors the slide-over's CurrencyNumericInput so the
   visual matches across surfaces — same currency prefix,
   same numeric formatting.

   Token-clean. No hardcoded greys / shadows.
   ============================================ */

import { useEffect, useRef, useState } from 'react';
import { budgetCurrencySymbol } from '@/lib/budget-currency';

interface Props {
  /** Current value to display when not editing. */
  value: number;
  /** Currency for the prefix symbol + display formatting. */
  currency: string;
  /** Format the read-only display. Caller controls (so the grid
   *  can pass formatCurrency from its existing helper). */
  formatDisplay: (n: number) => string;
  /** Called on commit (Enter / Tab / blur) when the value
   *  actually changed. Caller is responsible for the network
   *  write. */
  onCommit: (next: number) => void;
  /** Optional: when set, override the display value with this
   *  text (e.g. show an extra indicator inline). Edit mode
   *  still uses `value`. */
  displayPrefix?: React.ReactNode;
  /** Tooltip on the cell shell. */
  title?: string;
  /** When true, cell renders display-only — no edit mode. Used
   *  for derived rows (flight / hotel / gear) where the spec
   *  forbids in-place edits. */
  readOnly?: boolean;
  /** Style hook for the read-only display container. */
  displayClassName?: string;
}

export function BudgetCellInput({
  value,
  currency,
  formatDisplay,
  onCommit,
  displayPrefix,
  title,
  readOnly = false,
  displayClassName,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  /* When the prop value changes externally (e.g. router.refresh
     pulled a fresh row), drop any in-flight draft and resync. */
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- sync display draft from server when no edit is in flight (matches §8b2 ChannelBlock / TransactionsSection sync-from-server precedent) */
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = (): void => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setDraft(String(value));
      setEditing(false);
      return;
    }
    /* Cent-precision compare to avoid emitting a no-op write
       when the user just clicked into and out of the cell. */
    if (parsed.toFixed(2) !== Number(value).toFixed(2)) {
      onCommit(parsed);
    }
    setEditing(false);
  };

  const cancel = (): void => {
    setDraft(String(value));
    setEditing(false);
  };

  if (readOnly) {
    return (
      <span className={displayClassName} title={title}>
        {displayPrefix}
        {formatDisplay(value)}
      </span>
    );
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        onDoubleClick={() => setEditing(true)}
        className={displayClassName}
        title={title}
        style={{
          background: 'transparent',
          border: '1px solid transparent',
          width: '100%',
          textAlign: 'right',
          padding: '0 4px',
          cursor: 'text',
          color: 'inherit',
          font: 'inherit',
        }}
      >
        {displayPrefix}
        {formatDisplay(value)}
      </button>
    );
  }

  return (
    <span
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
          left: 6,
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--lp-text-tertiary)',
          fontSize: '11px',
          pointerEvents: 'none',
        }}
      >
        {budgetCurrencySymbol(currency)}
      </span>
      <input
        ref={inputRef}
        type="number"
        step="0.01"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Tab') {
            commit();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        style={{
          width: '100%',
          minWidth: 0,
          textAlign: 'right',
          paddingLeft: '1.4rem',
          paddingRight: '4px',
          border: '1px solid var(--color-lp-orange)',
          borderRadius: 3,
          background: 'var(--lp-surface)',
          color: 'var(--lp-text)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
          fontVariantNumeric: 'tabular-nums',
          outline: 'none',
        }}
      />
    </span>
  );
}
