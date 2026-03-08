'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StyledSelectOption<T = string> = { value: T; label: string };

export function StyledSelect<T extends string>({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  disabled,
  className,
  error,
}: {
  value: T;
  onChange: (value: T) => void;
  options: StyledSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-xl border bg-lp-surface px-4 py-2.5 text-left text-sm text-lp-text transition-all duration-150',
          open && 'ring-2 ring-lp-orange/20',
          error ? 'border-red-500' : 'border-lp-border focus:border-lp-orange',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <span className={selected ? '' : 'text-lp-text-tertiary'}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={16} className={cn('shrink-0 text-lp-text-tertiary transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-lp-border bg-lp-surface py-1 shadow-xl animate-scale-in">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm transition-colors',
                opt.value === value ? 'bg-lp-orange/10 text-lp-text' : 'text-lp-text hover:bg-lp-surface-hover'
              )}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={16} className="shrink-0 text-lp-orange" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
