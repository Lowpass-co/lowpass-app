'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Filter, X } from 'lucide-react';
import type { ColumnFilter, FilterValue } from './types';
import { defaultFilterValue, filterValueIsActive, formatFilterLabel } from './utils';
import { cn } from '@/lib/utils';

type DataTableFilterChipProps = {
  columnId: string;
  label: string;
  filter: ColumnFilter;
  value: FilterValue | undefined;
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (args: { close: () => void }) => React.ReactNode;
};

export function DataTableFilterChip({
  columnId,
  label,
  filter,
  value,
  onClear,
  open,
  onOpenChange,
  children,
}: DataTableFilterChipProps) {
  const id = useId();
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const active = filterValueIsActive(value, filter);

  useEffect(() => {
    if (!open) return;
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  const v = value ?? defaultFilterValue(filter);
  return (
    <div className="relative inline-flex items-center" data-dt-filter-chip={columnId}>
      <button
        ref={btnRef}
        type="button"
        id={id}
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          'inline-flex h-8 max-w-full items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors',
          active
            ? 'border-[#FF450055] text-[var(--lp-text)]'
            : 'border-[var(--lp-border)] text-[var(--lp-text-secondary)]',
        )}
        style={
          active
            ? { backgroundColor: 'var(--lp-bg-secondary)' }
            : { backgroundColor: 'var(--lp-surface)' }
        }
      >
        <Filter size={12} className="shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
        <span className="truncate">{label}</span>
        {active && v && <span className="text-[10px] opacity-80">: {formatFilterLabel(filter, v)}</span>}
        {active && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => {
              e.stopPropagation();
              onClear();
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }
            }}
            className="ml-0.5 rounded p-0.5 hover:bg-black/5"
            aria-label={`Clear ${label} filter`}
          >
            <X size={12} />
          </span>
        )}
      </button>
      {open && (
        <div
          ref={panelRef}
          className="fixed w-64 max-w-[min(100vw-24px,20rem)] rounded-xl border p-3 shadow-lg"
          style={{
            zIndex: 'calc(var(--lp-z-elevated) + 2)',
            top: pos.top,
            left: pos.left,
            backgroundColor: 'var(--lp-bg)',
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text)',
          }}
          role="dialog"
          aria-labelledby={id}
        >
          {children({ close: () => onOpenChange(false) })}
        </div>
      )}
    </div>
  );
}
