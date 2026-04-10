'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

export interface InlineEditCellProps {
  value: string | number | null;
  onSave: (newValue: string | number) => Promise<void>;
  type: 'text' | 'number' | 'currency' | 'percentage' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  readOnly?: boolean;
  align?: 'left' | 'right';
  className?: string;
  currency?: string;
}

const EMPTY = '—';

/** While typing decimals: allow only one `.`, optional leading `-`. */
function sanitizeDecimalInput(raw: string, allowNegative: boolean): string {
  let s = raw.replace(/[^\d.-]/g, '');
  if (!allowNegative) {
    s = s.replace(/-/g, '');
  } else {
    const neg = s.startsWith('-');
    s = s.replace(/-/g, '');
    if (neg) s = `-${s}`;
  }
  const parts = s.split('.');
  if (parts.length <= 1) return s;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function sanitizeIntegerInput(raw: string): string {
  return raw.replace(/\D/g, '');
}

function formatDisplay(
  value: string | number | null,
  type: InlineEditCellProps['type'],
  currency: string = 'GBP',
  options?: { value: string; label: string }[]
): string {
  if (value === undefined || value === null || value === '') return EMPTY;
  if (type === 'select' && options?.length) {
    const opt = options.find((o) => o.value === String(value));
    return opt ? opt.label : String(value);
  }
  if (type === 'currency') {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(Number(value));
  }
  if (type === 'percentage') {
    const n = Number(value);
    if (Number.isNaN(n)) return EMPTY;
    const t = Math.round(n * 1000) / 1000;
    const s = t.toFixed(3).replace(/\.?0+$/, '');
    return `${s}%`;
  }
  return String(value);
}

function valueToEditString(
  value: string | number | null | undefined,
  type: InlineEditCellProps['type']
): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'text' || type === 'select') return String(value);
  if (type === 'percentage' || type === 'currency') {
    const n = Number(value);
    return Number.isNaN(n) ? '' : String(value);
  }
  if (type === 'number') {
    const n = Number(value);
    return Number.isNaN(n) ? '' : String(Math.trunc(n));
  }
  return String(value);
}

export function InlineEditCell({
  value,
  onSave,
  type,
  options = [],
  placeholder,
  readOnly = false,
  align = 'left',
  className,
  currency = 'GBP',
}: InlineEditCellProps) {
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);

  const displayValue = formatDisplay(value, type, currency, options);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement && inputRef.current.type === 'text') {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = async () => {
    if (readOnly) return;
    setEditing(false);
    let newVal: string | number = inputValue.trim();

    if (type === 'number') {
      const cleaned = sanitizeIntegerInput(String(newVal));
      newVal = cleaned === '' ? 0 : parseInt(cleaned, 10);
    } else if (type === 'currency' || type === 'percentage') {
      const raw = String(newVal).replace(/[^0-9.-]/g, '');
      const n = parseFloat(raw);
      newVal = Number.isNaN(n) ? 0 : n;
    }

    setSaving(true);
    setError(false);
    try {
      await onSave(newVal);
    } catch {
      setError(true);
      setTimeout(() => setError(false), 1000);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      setEditing(false);
      setInputValue(valueToEditString(value, type));
    }
  };

  const showCurrencyCode = type === 'currency' && displayValue !== EMPTY;

  if (readOnly) {
    return (
      <span
        className={cn(
          'inline-flex min-w-0 max-w-full items-baseline gap-1 px-2 py-1.5 text-sm text-lp-text-secondary',
          align === 'right' && 'w-full justify-end font-[tabular-nums]',
          className
        )}
      >
        <span>{displayValue}</span>
        {showCurrencyCode && (
          <span className="shrink-0 text-[9px] font-semibold uppercase tracking-tight text-lp-text-tertiary">
            {currency}
          </span>
        )}
      </span>
    );
  }

  if (editing) {
    const inputClass =
      'lp-budget px-2 py-1.5 text-sm border border-lp-orange/35 rounded bg-lp-surface outline-none w-full font-[tabular-nums] focus:border-lp-orange/50 focus:ring-1 focus:ring-lp-orange/15';
    return (
      <span className={cn('block min-w-0', className)}>
        {type === 'select' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className={cn(inputClass, align === 'right' && 'text-right')}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            inputMode={type === 'number' ? 'numeric' : type === 'text' ? 'text' : 'decimal'}
            autoComplete="off"
            value={inputValue}
            onChange={(e) => {
              const v = e.target.value;
              if (type === 'number') setInputValue(sanitizeIntegerInput(v));
              else if (type === 'currency' || type === 'percentage') setInputValue(sanitizeDecimalInput(v, true));
              else setInputValue(v);
            }}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(inputClass, align === 'right' && 'text-right')}
          />
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setEditing(true);
        setInputValue(valueToEditString(value, type));
      }}
      className={cn(
        'inline-flex min-w-0 w-full cursor-pointer items-baseline gap-1 rounded px-2 py-1.5 text-left text-sm transition-colors',
        align === 'right' && 'justify-end font-[tabular-nums]',
        saving && 'opacity-70',
        error && 'bg-red-500/20 animate-pulse',
        !error && 'hover:bg-lp-orange/[0.04]',
        className
      )}
      title={saving ? 'Saving…' : undefined}
    >
      {saving ? (
        '…'
      ) : (
        <>
          <span>{displayValue}</span>
          {showCurrencyCode && (
            <span className="shrink-0 text-[9px] font-semibold uppercase tracking-tight text-lp-text-tertiary">
              {currency}
            </span>
          )}
        </>
      )}
    </button>
  );
}
