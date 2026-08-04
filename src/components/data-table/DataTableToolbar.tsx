'use client';

import { useState, type RefObject, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import type { ColumnDef, ColumnFilter, FilterValue } from './types';
import { DataTableFilterChip } from './DataTableFilterChip';
import { defaultFilterValue } from './utils';
import { cn } from '@/lib/utils';

type DataTableToolbarProps<T> = {
  columns: ColumnDef<T>[];
  filterState: Record<string, FilterValue | undefined>;
  onFilterStateChange: (id: string, v: FilterValue | undefined) => void;
  searchable: boolean;
  searchPlaceholder: string;
  searchValue: string;
  onSearchValueChange: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  selectable: boolean;
  selectedCount: number;
  displayTotal: number;
  selectionActions?: React.ReactNode;
  /** Right-aligned extra control (e.g. "Reset widths"). */
  rightExtra?: React.ReactNode;
};

function FilterForm({
  def,
  value,
  onChange,
  close,
}: {
  def: ColumnFilter;
  value: FilterValue;
  onChange: (v: FilterValue) => void;
  close: () => void;
}) {
  if (def.kind === 'text' && value.kind === 'text') {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-xs font-medium" style={{ color: 'var(--lp-text-secondary)' }}>
          Contains
        </label>
        <input
          className="w-full rounded-lg border px-2 py-1.5 text-sm"
          style={{ borderColor: 'var(--lp-border)', backgroundColor: 'var(--lp-bg)' }}
          value={value.value}
          onChange={e => onChange({ kind: 'text', value: e.target.value })}
          placeholder="Type to filter…"
        />
      </div>
    );
  }
  if (def.kind === 'select' && value.kind === 'select') {
    return (
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {def.options.map(o => (
          <button
            key={o.value}
            type="button"
            className={cn(
              'w-full rounded-md px-2 py-1.5 text-left text-sm',
              o.value === value.value ? 'font-semibold' : '',
            )}
            style={
              o.value === value.value
                ? { backgroundColor: 'var(--lp-bg-secondary)' }
                : undefined
            }
            onClick={() => {
              onChange({ kind: 'select', value: o.value });
              close();
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  if (def.kind === 'multiSelect' && value.kind === 'multiSelect') {
    return (
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {def.options.map(o => {
          const on = value.values.includes(o.value);
          return (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm"
            >
              {/* Styled to match the table's boxes — see DataTableRow. */}
              <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                className="peer h-4 w-4 cursor-pointer appearance-none rounded-[4px] border transition-colors"
                style={{
                  borderColor: on ? 'var(--lp-orange)' : 'var(--lp-border-strong)',
                  backgroundColor: on ? 'var(--lp-orange)' : 'transparent',
                }}
                checked={on}
                onChange={() => {
                  const set = new Set(value.values);
                  if (on) set.delete(o.value);
                  else set.add(o.value);
                  onChange({ kind: 'multiSelect', values: [...set] });
                }}
              />
              <Check size={11} strokeWidth={3} aria-hidden className="pointer-events-none absolute opacity-0 peer-checked:opacity-100" style={{ color: '#fff' }} />
              </span>
              {o.label}
            </label>
          );
        })}
        <button
          type="button"
          className="mt-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--lp-orange)', color: '#fff' }}
          onClick={close}
        >
          Apply
        </button>
      </div>
    );
  }
  if (def.kind === 'dateRange' && value.kind === 'dateRange') {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
            From
          </div>
          <input
            type="date"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--lp-border)' }}
            value={value.from}
            onChange={e => onChange({ ...value, from: e.target.value })}
          />
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
            To
          </div>
          <input
            type="date"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--lp-border)' }}
            value={value.to}
            onChange={e => onChange({ ...value, to: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="mt-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--lp-orange)', color: '#fff' }}
          onClick={close}
        >
          Apply
        </button>
      </div>
    );
  }
  if (def.kind === 'numberRange' && value.kind === 'numberRange') {
    return (
      <div className="flex flex-col gap-2">
        <div>
          <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
            Min
          </div>
          <input
            type="number"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--lp-border)' }}
            value={value.min}
            onChange={e => onChange({ ...value, min: e.target.value })}
          />
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
            Max
          </div>
          <input
            type="number"
            className="mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm"
            style={{ borderColor: 'var(--lp-border)' }}
            value={value.max}
            onChange={e => onChange({ ...value, max: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="mt-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: 'var(--lp-orange)', color: '#fff' }}
          onClick={close}
        >
          Apply
        </button>
      </div>
    );
  }
  return null;
}

function headerText(h: string | ReactNode) {
  if (typeof h === 'string') return h;
  return 'Filter';
}

export function DataTableToolbar<T>({
  columns,
  filterState,
  onFilterStateChange,
  searchable,
  searchPlaceholder,
  searchValue,
  onSearchValueChange,
  searchInputRef,
  selectable,
  selectedCount,
  displayTotal,
  selectionActions,
  rightExtra,
}: DataTableToolbarProps<T>) {
  const [openChip, setOpenChip] = useState<string | null>(null);
  const filterCols = columns.filter(c => c.filter);

  return (
    <div
      className="flex min-h-[48px] shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
      style={{ borderColor: 'var(--lp-border)' }}
    >
      {searchable && (
        <div
          className="flex w-[min(100%,320px)] min-w-0 items-center gap-2 rounded-lg px-3"
          style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}
        >
          <Search size={14} className="shrink-0" style={{ color: 'var(--lp-text-tertiary)' }} />
          <input
            ref={searchInputRef}
            type="search"
            value={searchValue}
            onChange={e => onSearchValueChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            style={{ color: 'var(--lp-text)' }}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                e.currentTarget.value = '';
                onSearchValueChange('');
                e.currentTarget.blur();
              }
            }}
            aria-label="Search table"
          />
        </div>
      )}

      {selectable && selectedCount > 0 && (
        <div
          className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold"
          style={{ color: 'var(--lp-text)' }}
        >
          <span>{selectedCount} selected</span>
          {selectionActions}
        </div>
      )}

      {filterCols.map(c => {
        const f = c.filter;
        if (!f) return null;
        const v = filterState[c.id] ?? defaultFilterValue(f);
        return (
          <DataTableFilterChip
            key={c.id}
            columnId={c.id}
            label={String(headerText(c.header))}
            filter={f}
            value={filterState[c.id]}
            onClear={() => onFilterStateChange(c.id, undefined)}
            open={openChip === c.id}
            onOpenChange={o => setOpenChip(o ? c.id : null)}
          >
            {({ close }) => <FilterForm def={f} value={v} onChange={next => onFilterStateChange(c.id, next)} close={close} />}
          </DataTableFilterChip>
        );
      })}

      <div className="ml-auto flex items-center gap-2">
        {rightExtra}
        <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
          {displayTotal} row{displayTotal === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
