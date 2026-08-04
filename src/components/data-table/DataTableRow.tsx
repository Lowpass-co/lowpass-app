'use client';

import type { RefObject, KeyboardEvent, MouseEvent } from 'react';
import { Check } from 'lucide-react';
import type { ColumnDef } from './types';
import { getCellValue, resolveWidthStyle } from './utils';
import { cn } from '@/lib/utils';

type DataTableRowProps<T> = {
  row: T;
  rowId: string;
  columns: ColumnDef<T>[];
  selectable: boolean;
  selected: boolean;
  focused: boolean;
  focusedRef?: RefObject<HTMLTableRowElement | null>;
  density: 'comfortable' | 'compact' | 'cozy';
  onRowClick?: (row: T) => void;
  onRowFocus: () => void;
  onCheckbox: (e: MouseEvent) => void;
  rowClassName?: (row: T) => string;
  frozenLeft: Record<string, number>;
  selectColWidth: number;
  onKeyDown: (e: KeyboardEvent) => void;
  tabIndex: number;
};

const cellPad = (d: 'comfortable' | 'compact' | 'cozy') => ({
  padding: `var(--lp-row-cell-padding-y-${d}) var(--lp-row-cell-padding-x)`,
  /* Grid system Phase 3 — type scale follows density (13 / 14 / 15px). */
  fontSize: `var(--lp-cell-font-size-${d})`,
});

/* Selection has to be legible at a glance. 5.1% was almost invisible on the
   dark surface — you could not tell a selected row from a hover. This is the
   G2-2b grammar the quote picker uses: a 12% tint plus an inset orange bar,
   drawn with box-shadow so the row's box never changes and nothing below it
   shifts when you select. */
const selectedBg = 'color-mix(in srgb, var(--lp-orange) 12%, transparent)';
const selectedBar = 'inset 2px 0 0 0 var(--lp-orange)';
const focusRing = 'inset 0 0 0 1px var(--lp-orange)';

export function DataTableRow<T>({
  row,
  rowId,
  columns,
  selectable,
  selected,
  focused,
  focusedRef,
  density,
  onRowClick,
  onRowFocus,
  onCheckbox,
  rowClassName,
  frozenLeft,
  selectColWidth,
  onKeyDown,
  tabIndex,
}: DataTableRowProps<T>) {
  return (
    <tr
      ref={focused ? focusedRef : undefined}
      tabIndex={tabIndex}
      data-row-id={rowId}
      onKeyDown={onKeyDown}
      className={cn('border-b text-sm outline-none transition-colors', rowClassName?.(row))}
      style={{
        height: `var(--lp-row-${density})`,
        borderColor: 'var(--lp-border-light)',
        backgroundColor: selected ? selectedBg : undefined,
        /* Focus ring and selection bar are both inset shadows, so they compose
           into one value rather than one overwriting the other. A row can be
           focused AND selected, and before this the ring silently won. */
        boxShadow:
          [focused ? focusRing : null, selected ? selectedBar : null]
            .filter(Boolean)
            .join(', ') || undefined,
        color: 'var(--lp-text)',
        ...(onRowClick
          ? { cursor: 'pointer' as const }
          : { cursor: 'default' as const }),
      }}
      onClick={() => {
        onRowFocus();
        onRowClick?.(row);
      }}
      onMouseDown={e => {
        if ((e.target as HTMLElement).closest('input[type="checkbox"]')) {
          e.preventDefault();
        }
      }}
      onMouseOver={e => {
        const tr = e.currentTarget as HTMLTableRowElement;
        if (!selected) {
          tr.style.backgroundColor = 'var(--lp-surface-hover)';
        }
      }}
      onMouseOut={e => {
        const tr = e.currentTarget as HTMLTableRowElement;
        tr.style.backgroundColor = selected ? selectedBg : '';
      }}
    >
      {selectable && (
        <td
          className="shrink-0"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          style={{
            width: selectColWidth,
            minWidth: selectColWidth,
            ...cellPad(density),
            position: 'sticky',
            left: 0,
            zIndex: 15,
            background: 'var(--lp-surface)',
            boxShadow: '1px 0 0 0 var(--lp-border-light)',
            verticalAlign: 'middle',
          }}
        >
          {/* A NATIVE checkbox paints its own white box on dark surfaces —
              the "weird white tick box". `accentColor` only colours the CHECKED
              fill, so the unchecked state stayed a bright square in a dark
              table. appearance-none hands us the box; the tick is drawn, and
              the input keeps its real semantics for screen readers and
              keyboards. */}
          <div className="flex justify-center">
            <span className="relative inline-flex h-[18px] w-[18px] items-center justify-center">
              <input
                type="checkbox"
                aria-label="Select row"
                className="peer h-[18px] w-[18px] cursor-pointer appearance-none rounded-[5px] border transition-colors"
                style={{
                  borderColor: selected ? 'var(--lp-orange)' : 'var(--lp-border-strong)',
                  backgroundColor: selected ? 'var(--lp-orange)' : 'transparent',
                }}
                checked={selected}
                onClick={onCheckbox}
                onChange={() => undefined}
              />
              <Check
                size={12}
                strokeWidth={3}
                aria-hidden
                className="pointer-events-none absolute opacity-0 peer-checked:opacity-100"
                style={{ color: '#fff' }}
              />
            </span>
          </div>
        </td>
      )}
      {columns.map(col => {
        const w = resolveWidthStyle(col.width);
        const v = getCellValue(row, col);
        const content = col.cell ? col.cell(v, row) : <span className="min-w-0">{formatForCell(v)}</span>;
        const frozen = col.frozen === true;
        const left = frozen ? (frozenLeft[col.id] ?? 0) : undefined;
        return (
          <td
            key={col.id}
            className={cn(
              'max-w-0',
              col.align === 'right' && 'text-right',
              col.align === 'center' && 'text-center',
              col.className,
            )}
            style={{
              ...w,
              minWidth: col.minWidth,
              ...cellPad(density),
              position: frozen ? 'sticky' : undefined,
              left: frozen ? left : undefined,
              zIndex: frozen ? 12 : undefined,
              background: frozen ? 'var(--lp-surface)' : undefined,
              boxShadow: frozen ? '1px 0 0 0 var(--lp-border-light)' : undefined,
              verticalAlign: 'middle',
            }}
          >
            <div className="min-w-0">{content}</div>
          </td>
        );
      })}
    </tr>
  );
}

function formatForCell(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object' && v instanceof Date) return v.toLocaleString();
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return String(v);
}
