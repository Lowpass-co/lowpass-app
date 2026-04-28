'use client';

import { ChevronsUpDown } from 'lucide-react';
import type { GridColumn } from './types';
import { cn } from '@/lib/utils';

const padY = (d: 'comfortable' | 'compact' | 'tight') => `var(--lp-row-cell-padding-y-${d})`;

type GridHeaderProps<T> = {
  columns: GridColumn<T>[];
  density: 'comfortable' | 'compact' | 'tight';
  columnWidths: Record<string, number>;
  setColumnWidth: (id: string, w: number) => void;
  frozenLeft: Record<string, number>;
  onMouseDownSelect?: (e: React.MouseEvent, colId: string) => void;
};

const DEF_W = 160;

function ColumnResizeHandle<T>({
  columnId,
  startWidth,
  column,
  onResize,
}: {
  columnId: string;
  startWidth: number;
  column: GridColumn<T>;
  onResize: (id: string, w: number) => void;
}) {
  return (
    <button
      type="button"
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize opacity-0 hover:opacity-100"
      style={{ width: 4 }}
      aria-label="Resize column"
      onMouseDown={e => {
        e.stopPropagation();
        e.preventDefault();
        const startX = e.clientX;
        const min = column.minWidth ?? 80;
        const max = column.maxWidth ?? 800;
        const onMm = (ev: MouseEvent) => {
          const dw = ev.clientX - startX;
          onResize(columnId, Math.min(max, Math.max(min, startWidth + dw)));
        };
        const onMu = () => {
          document.removeEventListener('mousemove', onMm);
          document.removeEventListener('mouseup', onMu);
        };
        document.addEventListener('mousemove', onMm);
        document.addEventListener('mouseup', onMu);
      }}
    />
  );
}

export function GridHeader<T>({
  columns,
  density,
  columnWidths,
  setColumnWidth,
  frozenLeft,
  onMouseDownSelect,
}: GridHeaderProps<T>) {
  return (
    <thead
      className="sticky top-0 z-20"
      style={{
        background: 'var(--lp-surface)',
        boxShadow: '0 1px 0 0 var(--lp-border-light)',
      }}
    >
      <tr>
        {columns.map((col, i) => {
          const w = columnWidths[col.id] ?? col.width ?? DEF_W;
          const isFrozen = i === 0 || col.frozen;
          const left = isFrozen ? (frozenLeft[col.id] ?? 0) : undefined;
          const resizable = col.resizable !== false;
          return (
            <th
              key={col.id}
              className={cn(
                "relative border-b text-left font-semibold uppercase [font-size:var(--lp-text-xs)] [letter-spacing:var(--lp-tracking-caps)]",
                col.align === 'right' && 'text-right',
                col.align === 'center' && 'text-center',
              )}
              style={{
                width: w,
                minWidth: col.minWidth ?? w,
                maxWidth: col.maxWidth,
                color: 'var(--lp-table-header-text)',
                padding: `${padY(density)} var(--lp-row-cell-padding-x)`,
                position: isFrozen ? 'sticky' : 'relative',
                left: isFrozen ? left : undefined,
                zIndex: isFrozen ? 25 : 1,
                background: isFrozen ? 'var(--lp-surface)' : 'var(--lp-surface)',
                borderColor: isFrozen ? 'var(--lp-border)' : 'var(--lp-border-light)',
                borderWidth: 1,
                borderStyle: 'solid',
              }}
              onMouseDown={e => onMouseDownSelect?.(e, col.id)}
            >
              <span className="inline-flex items-center gap-1 pr-1">
                {col.header}
                <ChevronsUpDown size={10} className="shrink-0 opacity-50" />
              </span>
              {resizable && (
                <ColumnResizeHandle
                  columnId={col.id}
                  startWidth={w}
                  column={col}
                  onResize={setColumnWidth}
                />
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function buildFrozenLeft<T>(columns: GridColumn<T>[], widths: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  let acc = 0;
  const def = 160;
  for (let i = 0; i < columns.length; i++) {
    const c = columns[i];
    const isFrozen = i === 0 || c.frozen;
    if (!isFrozen) continue;
    out[c.id] = acc;
    const w = widths[c.id] ?? c.width ?? def;
    acc += w;
  }
  return out;
}
