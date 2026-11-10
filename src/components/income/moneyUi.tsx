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

import { useState, type CSSProperties, type ReactNode } from 'react';

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
export const inputStyle: CSSProperties = {
  width: '100%',
  fontSize: 'var(--lp-text-sm)',
  fontFamily: 'var(--lp-font-numeric)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  background: 'var(--lp-bg)',
  color: 'var(--lp-text)',
  border: '1px solid var(--lp-border)',
  borderRadius: 'var(--lp-radius-md)',
  padding: 'var(--lp-space-1) var(--lp-space-2)',
};

/** A labelled number that saves on blur / Enter. Blank saves null. */
export function NumField({
  label,
  value,
  onCommit,
  disabled,
  suffix,
  placeholder,
  hint,
  actual,
}: {
  label: string;
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  suffix?: string;
  placeholder?: string;
  hint?: string;
  /** Writes ACTUAL money — green rule. */
  actual?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col" style={{ gap: 'var(--lp-space-1)' }} title={hint}>
      <span style={labelStyle}>
        {label}
        {suffix ? <span className="text-lp-text-tertiary"> ({suffix})</span> : null}
      </span>
      <NumInput value={value} onCommit={onCommit} disabled={disabled} placeholder={placeholder} actual={actual} ariaLabel={label} />
    </label>
  );
}

export function NumInput({
  value,
  onCommit,
  disabled,
  placeholder,
  actual,
  ariaLabel,
  width,
}: {
  value: number | null | undefined;
  onCommit: (v: number | null) => void;
  disabled?: boolean;
  placeholder?: string;
  actual?: boolean;
  ariaLabel: string;
  width?: string;
}) {
  return (
    <input
      key={`${ariaLabel}:${value ?? ''}`}
      aria-label={ariaLabel}
      type="number"
      inputMode="decimal"
      defaultValue={value ?? ''}
      disabled={disabled}
      placeholder={placeholder ?? '—'}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (raw === String(value ?? '')) return;
        const v = raw === '' ? null : Number(raw);
        if (v != null && !Number.isFinite(v)) return;
        onCommit(v);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      style={{
        ...inputStyle,
        width: width ?? '100%',
        borderLeft: actual ? `3px solid ${HUE_ACTUAL}` : inputStyle.border,
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
        className="lp-select"
        style={{ ...inputStyle, background: undefined, padding: undefined, textAlign: 'left', fontFamily: 'inherit' }}
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

/** Small inline adder: label + amount (+ an optional select). */
export function LineAdder({
  addLabel,
  busy,
  kinds,
  defaultKind,
  withDate,
  placeholder = 'Label',
  onAdd,
}: {
  addLabel: string;
  busy: boolean;
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
  if (!open) return <LinkButton onClick={() => setOpen(true)}>+ {addLabel}</LinkButton>;
  const small: CSSProperties = { ...inputStyle, width: 'auto', textAlign: 'left', fontFamily: 'inherit' };
  const amt = Number(amount);
  return (
    <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-2)' }}>
      {kinds ? (
        <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value)} className="lp-select" style={{ ...small, padding: undefined }}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      ) : null}
      {withDate ? null : (
        <input aria-label={placeholder} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={placeholder} style={{ ...small, width: '9rem' }} />
      )}
      <input aria-label="Amount" value={amount} inputMode="decimal" onChange={(e) => setAmount(e.target.value)} placeholder="Amount" style={{ ...inputStyle, width: '7rem' }} />
      {withDate ? <input aria-label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={small} /> : null}
      <LinkButton
        disabled={busy || !(amt > 0)}
        onClick={() => {
          onAdd({ kind: kinds ? kind : undefined, label: label.trim() || null, amount: amt, date: date || null });
          setOpen(false);
          setLabel('');
          setAmount('');
          setDate('');
        }}
      >
        Add
      </LinkButton>
      <LinkButton muted onClick={() => setOpen(false)}>
        Cancel
      </LinkButton>
    </div>
  );
}
