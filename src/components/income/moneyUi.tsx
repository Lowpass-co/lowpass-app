'use client';

/* ============================================
   LOWPASS — Income & settlements: the building blocks (Nov 2026, Adam)

   Colour carries ONE meaning each, everywhere on the page:
     neutral  — Expected (the deal: what the show should pay)
     green    — Actual / settled (what it did pay)
     amber    — needs you (to settle, awaiting payment)
     red      — only a number that is actually bad (short of expected,
                still owed after it should be paid)
   Inputs that write ACTUAL money carry a green rule; deal inputs don't.
   ============================================ */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { editText, formatAmount, isBlankValue, parseAmount, type AmountKind } from '@/lib/income/amountText';

export const HUE_ACTUAL = 'var(--color-lp-status-complete)';
export const HUE_NEEDS = 'var(--color-lp-warning)';
export const HUE_BAD = 'var(--color-lp-error)';

export function moneyFormat(currency: string): Intl.NumberFormat {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP', maximumFractionDigits: 0 });
  } catch {
    return new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  }
}

/** "£1,200" / "−£1,200" (a real minus). */
export function fmtMoney(fmt: Intl.NumberFormat, v: number): string {
  return `${v < 0 ? '−' : ''}${fmt.format(Math.abs(v))}`;
}

export function Chip({ label, hue }: { label: string; hue: string }) {
  return (
    <span
      className="inline-flex shrink-0 items-center whitespace-nowrap"
      style={{
        fontSize: 'var(--lp-text-2xs)',
        fontWeight: 'var(--lp-weight-semibold)',
        padding: 'var(--lp-space-1) var(--lp-space-2)',
        borderRadius: 'var(--lp-radius-full)',
        color: hue,
        border: `1px solid color-mix(in srgb, ${hue} 45%, transparent)`,
        background: `color-mix(in srgb, ${hue} 10%, transparent)`,
      }}
    >
      {label}
    </span>
  );
}

export function Card({ title, hint, accent, action, children }: { title: string; hint?: string; accent?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section
      className="rounded-lg border border-lp-border bg-lp-surface"
      style={{
        padding: 'var(--lp-space-4)',
        borderLeft: accent ? `3px solid color-mix(in srgb, ${accent} 70%, transparent)` : undefined,
      }}
    >
      <div className="flex flex-wrap items-start justify-between" style={{ gap: 'var(--lp-space-2)', marginBottom: 'var(--lp-space-3)' }}>
        <div className="min-w-0">
          <h3 className="text-lp-text" style={{ margin: 0, fontSize: 'var(--lp-text-base)', fontWeight: 'var(--lp-weight-semibold)' }}>
            {title}
          </h3>
          {hint ? (
            <p className="text-lp-text-secondary" style={{ margin: 'var(--lp-space-1) 0 0', fontSize: 'var(--lp-text-xs)' }}>
              {hint}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const labelStyle: CSSProperties = { fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' };

/* One box look for the page — the app's <TextInput> (rounded, surface,
   orange focus ring), numbers right-aligned in tabular figures. Nov 2026,
   Adam: "these text boxes look old". No spinners: the boxes are text. */
export const BOX_CLASS =
  'h-9 w-full min-w-0 rounded-lg border bg-lp-surface px-3 text-sm text-lp-text outline-none transition-colors ' +
  'placeholder:text-lp-text-tertiary hover:border-[var(--lp-border-strong)] ' +
  'focus-visible:border-[var(--color-lp-orange)] focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-0 ' +
  'disabled:cursor-not-allowed disabled:opacity-50';
const ACTUAL_RULE = `inset 3px 0 0 ${HUE_ACTUAL}`;

/** Legacy export (LineAdder's selects + inputs). */
export const inputStyle: CSSProperties = { fontVariantNumeric: 'tabular-nums' };

/** A labelled amount that saves on blur / Enter. Blank saves null. */
export function NumField({
  label,
  suffix,
  hint,
  ...input
}: Omit<NumInputProps, 'ariaLabel'> & { label: string; suffix?: string; hint?: string }) {
  return (
    <label className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-1)' }} title={hint}>
      <span style={labelStyle}>
        {label}
        {suffix ? <span className="text-lp-text-tertiary"> ({suffix})</span> : null}
      </span>
      <NumInput {...input} ariaLabel={label} />
    </label>
  );
}

export interface NumInputProps {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  /** money → "US$4,500", pct → "37%", count → "1,250". Default money. */
  kind?: AmountKind;
  /** For money. */
  currency?: string;
  /** A 0 the database filled in for "not set" shows the dash. Default true;
   *  false for counts where 0 means 0 (comps). */
  zeroIsBlank?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Writes ACTUAL money — green rule. */
  actual?: boolean;
  ariaLabel: string;
  width?: string;
}

/** Shows the value formatted at rest and the plain number while you type;
 *  what you type stays put until you leave the box, whatever the page
 *  re-renders underneath (the old box remounted on every save — Adam: "if
 *  I edit before the new thing displays, it overwrites it"). */
export function NumInput({ value, onCommit, kind = 'money', currency = 'GBP', zeroIsBlank = true, disabled, placeholder, actual, ariaLabel, width }: NumInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const blank = isBlankValue(value, zeroIsBlank);
  const shown = draft ?? (blank ? '' : formatAmount(Number(value), kind, currency));
  return (
    <input
      aria-label={ariaLabel}
      aria-invalid={bad || undefined}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={shown}
      disabled={disabled}
      placeholder={placeholder ?? '—'}
      title={bad ? 'That isn’t a number — nothing was saved' : undefined}
      className={BOX_CLASS}
      style={{
        width: width ?? '100%',
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        borderColor: bad ? 'var(--color-lp-error)' : undefined,
        boxShadow: actual ? ACTUAL_RULE : undefined,
      }}
      onFocus={(e) => {
        setBad(false);
        setDraft(editText(value, zeroIsBlank));
        const el = e.currentTarget;
        requestAnimationFrame(() => el.select());
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        const raw = e.target.value;
        setDraft(null);
        const v = parseAmount(raw);
        if (v === 'invalid') {
          setBad(true);
          return;
        }
        const before = blank ? null : Number(value);
        if (v === before || (v === 0 && before === null && zeroIsBlank && kind !== 'count')) return;
        onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(editText(value, zeroIsBlank));
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

export function SelField({
  label,
  value,
  options,
  onPick,
  disabled,
  hint,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onPick: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-1)' }}>
      <span style={labelStyle}>{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onPick(e.target.value)}
        className={`lp-select ${BOX_CLASS}`}
        style={{ paddingTop: 0, paddingBottom: 0 }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hint ? <span className="text-lp-text-tertiary" style={{ fontSize: 'var(--lp-text-2xs)' }}>{hint}</span> : null}
    </label>
  );
}

export function FieldGrid({ children, cols = 2 }: { children: ReactNode; cols?: number }) {
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 'var(--lp-space-3)' }}>
      {children}
    </div>
  );
}

/** A small text button (adders, secondary actions). */
export function LinkButton({ children, onClick, disabled, muted }: { children: ReactNode; onClick: () => void; disabled?: boolean; muted?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-semibold)',
        color: muted ? 'var(--lp-text-tertiary)' : 'var(--color-lp-orange)',
        background: 'transparent',
        border: 0,
        padding: 0,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

export function Button({ children, onClick, disabled, primary, title }: { children: ReactNode; onClick: () => void; disabled?: boolean; primary?: string; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="btn-transition"
      style={{
        padding: 'var(--lp-space-1) var(--lp-space-3)',
        fontSize: 'var(--lp-text-xs)',
        fontWeight: 'var(--lp-weight-semibold)',
        borderRadius: 'var(--lp-radius-md)',
        cursor: disabled ? 'default' : 'pointer',
        border: `1px solid ${primary ?? 'var(--lp-border-strong)'}`,
        background: primary ?? 'transparent',
        color: primary ? 'var(--lp-text-inverse)' : 'var(--lp-text)',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/** Small inline adder: label + amount (+ an optional select). Enter adds,
 *  Escape closes. The line appears at once (the page saves it behind). */
export function LineAdder({
  addLabel,
  kinds,
  defaultKind,
  withDate,
  placeholder = 'Label',
  onAdd,
}: {
  addLabel: string;
  /** Kept for callers; adding is never blocked by a save in flight now. */
  busy?: boolean;
  kinds?: ReadonlyArray<{ value: string; label: string }>;
  defaultKind?: string;
  withDate?: boolean;
  placeholder?: string;
  onAdd: (f: { kind?: string; label: string | null; amount: number; date: string | null }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(defaultKind ?? kinds?.[0]?.value ?? '');
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const first = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    if (open) first.current?.focus();
  }, [open]);
  if (!open) return <LinkButton onClick={() => setOpen(true)}>+ {addLabel}</LinkButton>;
  const parsed = parseAmount(amount);
  const amt = typeof parsed === 'number' ? parsed : NaN;
  const ok = amt > 0;
  const close = () => {
    setOpen(false);
    setLabel('');
    setAmount('');
    setDate('');
  };
  const add = () => {
    if (!ok) return;
    onAdd({ kind: kinds ? kind : undefined, label: label.trim() || null, amount: amt, date: date || null });
    // Stay open for the next one; the line is already on the page.
    setLabel('');
    setAmount('');
    setDate('');
    first.current?.focus();
  };
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      add();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }} onKeyDown={keys}>
      {kinds ? (
        <select
          ref={(el) => {
            if (kinds) first.current = el;
          }}
          aria-label="Kind"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className={`lp-select ${BOX_CLASS}`}
          style={{ width: 'auto', paddingTop: 0, paddingBottom: 0 }}
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      ) : null}
      {withDate ? null : (
        <input
          ref={(el) => {
            if (!kinds) first.current = el;
          }}
          aria-label={placeholder}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder={placeholder}
          className={BOX_CLASS}
          style={{ width: '10rem' }}
        />
      )}
      <input
        aria-label="Amount"
        value={amount}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        onChange={(e) => setAmount(e.target.value)}
        placeholder="Amount"
        className={BOX_CLASS}
        style={{ width: '7.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      />
      {withDate ? <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={BOX_CLASS} style={{ width: 'auto' }} /> : null}
      <Button primary={ok ? 'var(--color-lp-orange)' : undefined} disabled={!ok} onClick={add} title="Enter">
        Add
      </Button>
      <LinkButton muted onClick={close}>
        Done
      </LinkButton>
    </div>
  );
}
