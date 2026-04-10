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
  size = 'md',
  variant = 'default',
}: {
  value: T;
  onChange: (value: T) => void;
  options: StyledSelectOption<T>[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  error?: boolean;
  /** `sm` matches compact toolbar filters (e.g. Equipment). */
  size?: 'md' | 'sm';
  /** `plain` — no field chrome; text + chevron only (e.g. header scope). */
  variant?: 'default' | 'plain';
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
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
          if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          'flex w-full items-center justify-between text-left transition-all duration-150',
          variant === 'plain'
            ? cn(
                'gap-1.5 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-base font-normal text-lp-text',
                'hover:bg-lp-bg-tertiary/60',
                open && 'bg-lp-bg-tertiary/40 ring-0',
                error && 'text-red-600 dark:text-red-400',
                !error && !disabled && 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lp-orange/25'
              )
            : cn(
                'border bg-lp-surface text-lp-text',
                size === 'sm'
                  ? 'h-9 rounded-lg px-3 py-2 text-sm'
                  : 'h-11 rounded-xl px-4 py-2.5 text-sm',
                open && 'ring-2 ring-lp-orange/20',
                error ? 'border-red-500' : 'border-lp-border focus:border-lp-orange',
                disabled && 'cursor-not-allowed opacity-50'
              ),
          variant === 'plain' && disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'min-w-0 truncate',
            selected ? '' : 'font-normal text-lp-text-tertiary',
            variant === 'plain' && selected && 'text-lp-text'
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={variant === 'plain' ? 18 : size === 'sm' ? 14 : 16}
          className={cn(
            'shrink-0 text-lp-text-secondary transition-transform duration-150',
            open && 'rotate-180',
            variant === 'plain' && 'opacity-80'
          )}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto border border-lp-border bg-lp-surface py-1 shadow-xl animate-scale-in',
            size === 'sm' ? 'rounded-lg' : 'rounded-xl'
          )}
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              role="option"
              aria-selected={opt.value === value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={cn(
                'flex w-full items-center justify-between gap-2 text-left text-sm transition-colors',
                size === 'sm' ? 'px-3 py-2' : 'px-4 py-2.5',
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
