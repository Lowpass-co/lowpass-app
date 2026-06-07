'use client';

import { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import type { ColumnDef } from './types';
import { resolveWidthStyle } from './utils';
import { cn } from '@/lib/utils';

type DataTableHeaderProps<T> = {
  columns: ColumnDef<T>[];
  selectable: boolean;
  density: 'comfortable' | 'compact' | 'cozy';
  sortColumnId: string | null;
  sortDirection: 'asc' | 'desc' | null;
  onSortClick: (columnId: string) => void;
  headerCheckbox: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
  } | null;
  frozenLeft: Record<string, number>;
  stickyHeader: boolean;
  selectColWidth: number;
};

const headerPadY = (d: 'comfortable' | 'compact' | 'cozy') => `var(--lp-row-cell-padding-y-${d})`;
const thBase =
  "border-b text-left font-semibold uppercase [font-size:var(--lp-text-xs)] [letter-spacing:var(--lp-tracking-caps)]";

export function DataTableHeader<T>({
  columns,
  selectable,
  density,
  sortColumnId,
  sortDirection,
  onSortClick,
  headerCheckbox,
  frozenLeft,
  stickyHeader,
  selectColWidth,
}: DataTableHeaderProps<T>) {
  const headerRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerRef.current) {
      headerRef.current.indeterminate = headerCheckbox?.indeterminate ?? false;
    }
  }, [headerCheckbox?.indeterminate, headerCheckbox]);

  const stickyT = stickyHeader
    ? {
        position: 'sticky' as const,
        top: 0,
        zIndex: 20,
        background: 'var(--lp-surface)',
        boxShadow: '0 1px 0 0 var(--lp-border-light)',
      }
    : { background: 'var(--lp-surface)' };

  return (
    <thead style={stickyT}>
      <tr>
        {selectable && (
          <th
            className="shrink-0"
            style={{
              width: selectColWidth,
              minWidth: selectColWidth,
              padding: `${headerPadY(density)} var(--lp-row-cell-padding-x)`,
              color: 'var(--lp-table-header-text)',
              position: 'sticky' as const,
              left: 0,
              zIndex: 30,
              background: 'var(--lp-surface)',
              boxShadow: '1px 0 0 0 var(--lp-border-light)',
            }}
            aria-label="Select rows"
          >
            {headerCheckbox && (
              <div className="flex justify-center" onClick={e => e.stopPropagation()}>
                <input
                  ref={headerRef}
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  style={{ borderColor: 'var(--lp-border)', accentColor: 'var(--lp-orange)' }}
                  checked={headerCheckbox.checked}
                  onChange={headerCheckbox.onChange}
                />
              </div>
            )}
          </th>
        )}
        {columns.map(col => {
          const w = resolveWidthStyle(col.width);
          const sortable = col.sortable === true;
          const active = sortColumnId === col.id;
          const frozen = col.frozen === true;
          const left = frozen ? (frozenLeft[col.id] ?? 0) : undefined;
          const isFrozen = Boolean(frozen);
          return (
            <th
              key={col.id}
              className={cn(
                thBase,
                col.className,
                col.align === 'right' && 'text-right',
                col.align === 'center' && 'text-center',
              )}
              style={{
                color: 'var(--lp-table-header-text)',
                padding: `${headerPadY(density)} var(--lp-row-cell-padding-x)`,
                ...w,
                minWidth: col.minWidth,
                position: isFrozen ? 'sticky' : undefined,
                left: isFrozen ? left : undefined,
                zIndex: isFrozen ? 25 : undefined,
                background: isFrozen ? 'var(--lp-surface)' : undefined,
                boxShadow: isFrozen ? '1px 0 0 0 var(--lp-border-light)' : undefined,
              }}
              aria-sort={
                !sortable
                  ? undefined
                  : !active
                    ? 'none'
                    : sortDirection === 'asc'
                      ? 'ascending'
                      : 'descending'
              }
            >
              {sortable ? (
                <button
                  type="button"
                  className="inline-flex w-full min-w-0 items-center justify-start gap-1 text-inherit"
                  onClick={() => onSortClick(col.id)}
                >
                  <span className="truncate">{col.header}</span>
                  <span className="inline-flex shrink-0" style={{ color: active ? 'var(--lp-orange)' : 'var(--lp-text-tertiary)' }}>
                    {active && sortDirection === 'asc' ? (
                      <ChevronUp size={12} />
                    ) : active && sortDirection === 'desc' ? (
                      <ChevronDown size={12} />
                    ) : (
                      <ChevronsUpDown size={12} />
                    )}
                  </span>
                </button>
              ) : (
                <span className="block truncate">{col.header}</span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function collectFrozenOffsets<T>(args: {
  columns: ColumnDef<T>[];
  selectable: boolean;
  selectWidth: number;
}): Record<string, number> {
  const { columns, selectable, selectWidth } = args;
  const offsets: Record<string, number> = {};
  let acc = selectable ? selectWidth : 0;
  for (const c of columns) {
    if (!c.frozen) continue;
    offsets[c.id] = acc;
    if (typeof c.width === 'number') {
      acc += c.width;
    } else if (typeof c.width === 'string' && c.width.endsWith('px')) {
      acc += parseFloat(c.width) || 0;
    } else {
      acc += c.minWidth ?? 120;
    }
  }
  return offsets;
}
