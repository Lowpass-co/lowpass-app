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
    return `${Number(value).toFixed(1)}%`;
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
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = async () => {
    if (readOnly) return;
    setEditing(false);
    let newVal: string | number = inputValue.trim();
    if (type === 'number' || type === 'currency' || type === 'percentage') {
      const n = parseFloat(String(newVal).replace(/[^0-9.-]/g, ''));
      newVal = Number.isNaN(n) ? 0 : n;
    }
    const prev = value;
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
      setInputValue(value === null || value === undefined ? '' : String(value));
    }
  };

  if (readOnly) {
    return (
      <span
        className={cn(
          'px-2 py-1.5 text-sm text-lp-text-secondary',
          align === 'right' && 'text-right font-[tabular-nums]',
          className
        )}
      >
        {displayValue}
      </span>
    );
  }

  if (editing) {
    const inputClass =
      'px-2 py-1 text-sm border border-lp-orange rounded bg-transparent outline-none w-full font-[tabular-nums]';
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
            type={type === 'currency' || type === 'percentage' ? 'number' : type === 'number' ? 'number' : 'text'}
            step={type === 'percentage' ? '0.1' : type === 'currency' ? '0.01' : undefined}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
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
        setInputValue(
          value === null || value === undefined || value === ''
            ? ''
            : type === 'percentage'
              ? String(Number(value))
              : String(value)
        );
      }}
      className={cn(
        'px-2 py-1.5 text-sm cursor-pointer rounded w-full text-left transition-colors',
        align === 'right' && 'text-right font-[tabular-nums]',
        saving && 'opacity-70',
        error && 'bg-red-500/20 animate-pulse',
        !error && 'hover:bg-lp-orange/5',
        className
      )}
      title={saving ? 'Saving…' : undefined}
    >
      {saving ? '…' : displayValue}
    </button>
  );
}
