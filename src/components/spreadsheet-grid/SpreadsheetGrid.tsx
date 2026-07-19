'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useAppDensity } from '@/lib/density/appDensity';
import { useColumnWidths } from '@/lib/grid/useColumnWidths';
import { GridDataRow } from './GridDataRow';
import { buildFrozenLeft, GridHeader } from './GridHeader';
import { GridBody } from './GridBody';
import { GridSectionHeader } from './GridSectionHeader';
import { useGridEditing } from './hooks/useGridEditing';
import { useGridSelection } from './hooks/useGridSelection';
import { useGridVirtualisation } from './hooks/useGridVirtualisation';
import type { CellCoord, GridColumn, GridRow, SelectionRange, SpreadsheetGridProps } from './types';
import { getCellRaw } from './utils/accessor';
import { filterCollapsed } from './utils/collapseFilter';
import {
  getRowIdsInRange,
  isRectSingleColumn,
  mergeWithSections,
  partitionRows,
} from './utils/displayRows';
import { valueToEditString } from './utils/format';
import { getDataRowIdOrder, isReadOnly, nextCellId, nextEditableCell } from './utils/nav';
import { parseInput } from './utils/parse';
import { validateValue } from './utils/validate';

const DEF_W = 160;

const rowHeightPx: Record<'comfortable' | 'compact' | 'tight' | 'cozy', number> = {
  comfortable: 44,
  compact: 32,
  tight: 28,
  cozy: 56,
};

function keyCell(row: string, col: string) {
  return `${row}::${col}`;
}

export function SpreadsheetGrid<T>(props: SpreadsheetGridProps<T>) {
  const {
    columns,
    rows,
    density: densityProp,
    sectionHeaders,
    onSelectionChange,
    onCommitCell,
    onBulkEdit,
    onRowOpen,
    onRowDelete,
    onRowDuplicate,
    contextMenuItems,
    containerHeight = '100%',
    ariaLabel = 'Spreadsheet',
    entitySearchTourId,
    columnWidthsKey,
    cellReadOnly,
  } = props;

  // Grid system Phase 1 — density comes from the one app-wide preference
  // unless a caller pins it explicitly (e.g. the admin playground).
  const { density: appDensity } = useAppDensity();
  const density = densityProp ?? appDensity;

  const { top, middle, bottom } = useMemo(() => partitionRows(rows), [rows]);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  const merged = useMemo(
    () => mergeWithSections(middle, sectionHeaders),
    [middle, sectionHeaders]
  );
  const displayFlat = useMemo(
    () => filterCollapsed(merged, collapsed),
    [merged, collapsed]
  );

  // Per-column drag-to-resize + persistence (shared hook). Widths persist
  // when a columnWidthsKey is passed (e.g. per-tour); otherwise ephemeral.
  const colSpecs = useMemo(
    () =>
      columns.map(c => ({
        key: c.id,
        width: c.width ?? DEF_W,
        min: c.minWidth ?? 80,
        resizable: c.resizable !== false,
      })),
    [columns]
  );
  const { widthFor, hasOverride, startResize, reset: resetWidths, isCustomised } =
    useColumnWidths(colSpecs, columnWidthsKey);
  const columnWidths = useMemo(() => {
    const w: Record<string, number> = {};
    for (const c of columns) w[c.id] = widthFor(c.id);
    return w;
  }, [columns, widthFor]);

  // The flexible primary column (e.g. the name/description) absorbs the
  // leftover width: width:auto unless the user has dragged it. Pick the
  // first column flagged `flex` (consumers mark their name column).
  const FLEX_MIN = 200;
  const flexColId = useMemo(
    () => columns.find(c => c.flex)?.id ?? null,
    [columns]
  );
  // Table minWidth — the flex column counts its min (not its default)
  // when undragged, so the grid scrolls only when the OTHER columns
  // genuinely overflow.
  const tableWidth = useMemo(
    () =>
      columns.reduce((sum, c) => {
        if (c.id === flexColId && !hasOverride(c.id)) return sum + FLEX_MIN;
        return sum + (columnWidths[c.id] ?? 0);
      }, 0),
    [columns, flexColId, hasOverride, columnWidths]
  );

  const frozenLeft = useMemo(
    () => buildFrozenLeft(columns, columnWidths),
    [columns, columnWidths]
  );

  const sel = useGridSelection(columns, displayFlat);
  const edit = useGridEditing();
  const [cellErr, setCellErr] = useState<Record<string, string | null>>({});
  const [bulkErr, setBulkErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ x: number; y: number; rowId: string } | null>(null);
  const drag = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);

  const rH = rowHeightPx[density];
  const virt = useGridVirtualisation(displayFlat.length, rH);
  const { startIndex, endIndex, offsetY, totalHeight, scrollRef, onScroll } = virt;
  const slice = displayFlat.slice(startIndex, endIndex);

  const colIds = useMemo(() => columns.map(c => c.id), [columns]);
  const dataIdOrder = useMemo(() => getDataRowIdOrder(displayFlat), [displayFlat]);

  // Phase P — Tab walks only EDITABLE cells (skips read-only/computed columns
  // like the payroll totals) so a typed value's commit always fires and focus
  // never escapes the grid. Predicate resolves the live row + column.
  const colById = useMemo(() => new Map(columns.map(c => [c.id, c])), [columns]);
  const rowById = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  // The read-only decision for a specific cell: the column/row rule (isReadOnly)
  // OR the caller's per-cell predicate. One place, so styling, click-to-edit,
  // keyboard entry, and Tab-skip all agree.
  const roCell = useCallback(
    (row: GridRow<T>, col: GridColumn<T>) => isReadOnly(row, col) || !!cellReadOnly?.(row, col),
    [cellReadOnly]
  );
  const isCellEditable = useCallback(
    (rowId: string, colId: string) => {
      const row = rowById.get(rowId);
      const col = colById.get(colId);
      return !!row && !!col && !roCell(row, col);
    },
    [rowById, colById, roCell]
  );

  useEffect(() => {
    if (sel.range) onSelectionChange?.(sel.range);
  }, [onSelectionChange, sel.range]);

  const commit = useCallback(
    async (row: GridRow<T>, col: GridColumn<T>, raw: string) => {
      const p = parseInput(raw, col.type);
      if (!p.ok) {
        setCellErr(m => ({ ...m, [keyCell(row.id, col.id)]: p.error }));
        return;
      }
      const v = p.value;
      const err = validateValue(v, col.type, row.data, { validator: col.validator });
      if (err) {
        setCellErr(m => ({ ...m, [keyCell(row.id, col.id)]: err }));
        return;
      }
      setCellErr(m => ({ ...m, [keyCell(row.id, col.id)]: null }));
      if (col.onCommit) {
        try {
          await col.onCommit(row.data, v);
        } catch (e) {
          setToast(e instanceof Error ? e.message : 'Commit failed');
          return;
        }
      }
      if (onCommitCell) {
        try {
          await onCommitCell(row.id, col.id, v);
        } catch (e) {
          setToast(e instanceof Error ? e.message : 'Commit failed');
        }
      }
    },
    [onCommitCell]
  );

  const finishEdit = useCallback(
    async (nav?: 'down' | 'right' | 'none') => {
      if (edit.mode !== 'edit' || !sel.focus) {
        return;
      }
      const row = rows.find(r => r.id === sel.focus!.rowId);
      const col = columns.find(c => c.id === sel.focus!.columnId);
      if (!row || !col) {
        edit.cancelEdit();
        return;
      }
      if (roCell(row, col)) {
        edit.cancelEdit();
        return;
      }
      setBulkErr(null);
      if (sel.range) {
        if (!isRectSingleColumn(sel.range)) {
          setBulkErr('Select a single column to fill multiple rows.');
          return;
        }
        const rids = getRowIdsInRange(
          displayFlat as import('./types').DisplayEntry<T>[],
          sel.range.startRowId,
          sel.range.endRowId
        );
        if (rids.length > 1 && onBulkEdit) {
          const p = parseInput(edit.draft, col.type);
          if (!p.ok) {
            setCellErr(m => ({ ...m, [keyCell(row.id, col.id)]: p.error }));
            return;
          }
          try {
            await onBulkEdit(rids, col.id, p.value);
          } catch (e) {
            setToast(e instanceof Error ? e.message : 'Bulk failed');
            return;
          }
          edit.cancelEdit();
          if (nav === 'down' && sel.focus) {
            const n = nextCellId(dataIdOrder, colIds, sel.focus, 1, 0);
            if (n) sel.moveFocus(n);
          } else if (nav === 'right' && sel.focus) {
            const n = nextEditableCell(dataIdOrder, colIds, isCellEditable, sel.focus, 1);
            if (n) sel.moveFocus(n);
          }
          return;
        }
      }
      await commit(row, col, edit.draft);
      edit.cancelEdit();
      if (nav === 'down') {
        const n = nextCellId(dataIdOrder, colIds, sel.focus, 1, 0);
        if (n) sel.moveFocus(n);
      } else if (nav === 'right') {
        const n = nextEditableCell(dataIdOrder, colIds, isCellEditable, sel.focus, 1);
        if (n) sel.moveFocus(n);
      }
    },
    [colIds, columns, commit, dataIdOrder, displayFlat, edit, isCellEditable, onBulkEdit, roCell, rows, sel]
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!gridRef.current?.contains(e.target as Node)) return;
      if (edit.mode === 'edit') {
        if (e.key === 'Escape') {
          e.preventDefault();
          edit.cancelEdit();
          return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          void finishEdit('down');
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          if (e.shiftKey) {
            void finishEdit('none');
            const n = sel.focus && nextEditableCell(dataIdOrder, colIds, isCellEditable, sel.focus, -1);
            if (n) sel.moveFocus(n);
          } else {
            void finishEdit('right');
          }
        }
        return;
      }
      // Phase P — Tab in NAVIGATE mode moves to the next editable cell and
      // preventDefaults, so focus never falls through to the browser (the bug
      // that dropped typed payroll rates after the last editable cell).
      if (e.key === 'Tab' && sel.focus) {
        e.preventDefault();
        const n = nextEditableCell(dataIdOrder, colIds, isCellEditable, sel.focus, e.shiftKey ? -1 : 1);
        if (n) sel.moveFocus(n);
        return;
      }
      if (e.key === 'Enter' && sel.focus) {
        e.preventDefault();
        const row = rows.find(r => r.id === sel.focus!.rowId);
        const col = columns.find(c => c.id === sel.focus!.columnId);
        if (row && col && !roCell(row, col)) {
          const v = getCellRaw(row, col);
          edit.enterEdit(valueToEditString(v, col.type), { bulk: false });
        }
        return;
      }
      if (e.key === 'F2' && sel.focus) {
        e.preventDefault();
        const row = rows.find(r => r.id === sel.focus!.rowId);
        const col = columns.find(c => c.id === sel.focus!.columnId);
        if (row && col && !roCell(row, col)) {
          const v = getCellRaw(row, col);
          edit.enterEdit(valueToEditString(v, col.type), { bulk: false });
        }
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        e.preventDefault();
        sel.selectAll();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        const r0 = rows.find(x => x.id === sel.focus?.rowId);
        if (r0 && onRowOpen) onRowOpen(r0.data);
        return;
      }
      if (sel.range && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        if (!isRectSingleColumn(sel.range)) {
          e.preventDefault();
          setBulkErr('Type into a range in a single column, or a single cell.');
          return;
        }
        const row = rows.find(r => r.id === sel.focus?.rowId);
        const col = columns.find(c => c.id === sel.focus?.columnId);
        if (row && col && !roCell(row, col)) {
          const rids = getRowIdsInRange(
            displayFlat as import('./types').DisplayEntry<T>[],
            sel.range.startRowId,
            sel.range.endRowId
          );
          e.preventDefault();
          edit.enterEdit(e.key, { bulk: rids.length > 1 });
          return;
        }
      }
      if (!sel.focus) return;
      const dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      const dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      if (dr || dc) {
        e.preventDefault();
        const n = nextCellId(dataIdOrder, colIds, sel.focus, dr, dc);
        if (n) {
          if (e.shiftKey) sel.extendFocus(n);
          else sel.moveFocus(n);
        }
      }
    },
    [colIds, columns, dataIdOrder, displayFlat, edit, finishEdit, isCellEditable, onRowOpen, roCell, rows, sel]
  );

  const onCellDown = (rowId: string, colId: string, e: React.MouseEvent, sh: boolean) => {
    if (e.button !== 0) return;
    e.preventDefault();
    gridRef.current?.focus();
    drag.current = true;
    const c: CellCoord = { rowId, columnId: colId };
    if (sh) {
      sel.extendFocus(c);
    } else {
      sel.selectOne(c);
    }
  };

  const onCellEnter = (rowId: string, colId: string) => {
    if (!drag.current) return;
    sel.extendFocus({ rowId, columnId: colId });
  };

  useEffect(() => {
    const u = () => {
      drag.current = false;
    };
    document.addEventListener('mouseup', u);
    return () => document.removeEventListener('mouseup', u);
  }, []);

  const isCellEditing = (r: string, c: string) =>
    edit.mode === 'edit' && sel.focus?.rowId === r && sel.focus?.columnId === c;
  const showBulkHint = (r: string, c: string) => edit.bulkHint && isCellEditing(r, c);

  const toggleSection = (id: string) => {
    setCollapsed(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const announce = (selR: SelectionRange | null) => {
    if (!selR) return;
    if (liveRef.current) {
      liveRef.current.textContent = `Selection: ${selR.startRowId} to ${selR.endRowId}, columns ${selR.startColumnId} to ${selR.endColumnId}`;
    }
  };
  useEffect(() => {
    announce(sel.range);
  }, [sel.range]);

  return (
    <div
      className="relative mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-xl"
      data-spreadsheet-root
      style={{
        /* Raised panel — an elevated surface (distinct from the page
           --lp-bg) with a visible shadow, so it pops on dark where the
           bg/surface contrast is the elevation cue. Capped + centred so
           ultra-wide screens don't strand the name column. */
        border: '1px solid var(--lp-border-strong)',
        background: 'var(--lp-surface)',
        boxShadow: 'var(--lp-shadow-md)',
        fontVariantNumeric: 'tabular-nums',
        maxWidth: 1600,
        height: containerHeight,
      }}
    >
      {/* Column resize — restore default widths (only when customised). */}
      {isCustomised && (
        <button
          type="button"
          onClick={resetWidths}
          className="btn-transition absolute right-1 top-1 z-30 rounded-md border px-2 py-0.5"
          style={{
            borderColor: 'var(--lp-border-strong)',
            background: 'var(--lp-surface)',
            color: 'var(--lp-text-tertiary)',
            fontSize: '11px',
            fontWeight: 500,
          }}
          title="Reset column widths to defaults"
        >
          Reset widths
        </button>
      )}
      {toast && (
        <div
          className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border px-3 py-2 text-sm shadow-lg"
          style={{
            background: 'var(--lp-bg)',
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text)',
          }}
          role="status"
        >
          {toast}
        </div>
      )}
      <div
        ref={gridRef}
        className="min-h-0 flex-1 outline-none"
        role="grid"
        aria-label={ariaLabel}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        <div
          className="h-full min-h-0 overflow-auto"
          ref={scrollRef as React.RefObject<HTMLDivElement>}
          onScroll={onScroll}
        >
          <table
            className="border-collapse"
            style={{ tableLayout: 'fixed', width: '100%', minWidth: tableWidth }}
          >
            <colgroup>
              {columns.map(c => {
                // Flex column → width:auto (absorbs the leftover) unless
                // the user dragged it; every other column stays fixed +
                // resizable.
                const flexAuto = c.id === flexColId && !hasOverride(c.id);
                return (
                  <col
                    key={c.id}
                    style={
                      flexAuto
                        ? { width: 'auto', minWidth: FLEX_MIN }
                        : { width: widthFor(c.id) }
                    }
                  />
                );
              })}
            </colgroup>
            <GridHeader
              columns={columns}
              density={density}
              columnWidths={columnWidths}
              onStartResize={startResize}
              frozenLeft={frozenLeft}
            />
            <GridBody>
              {top.map(tr => (
                <GridDataRow
                  key={tr.id}
                  row={tr}
                  rowIndex1={1}
                  columns={columns}
                  columnWidths={columnWidths}
                  frozenLeft={frozenLeft}
                  density={density}
                  isInRange={sel.isInRange}
                  isActive={sel.isActive}
                  isEditing={isCellEditing}
                  mode={edit.mode}
                  draft={edit.draft}
                  onDraft={edit.setDraft}
                  onEditorKey={e => {
                    if (e.key === 'Enter' && e.shiftKey) e.preventDefault();
                  }}
                  onCellMouseDown={onCellDown}
                  onCellMouseEnter={onCellEnter}
                  readOnly={(r, c) => roCell(r, c)}
                  readOnlyHint={r => (r.computed ? 'Derived' : 'Read-only')}
                  error={(a, c) => cellErr[keyCell(a, c)]}
                  showBulkHint={showBulkHint}
                  entitySearchTourId={entitySearchTourId}
                  onContextMenu={e => {
                    e.preventDefault();
                    setCtx({ x: e.clientX, y: e.clientY, rowId: tr.id });
                  }}
                />
              ))}
              {offsetY > 0 && (
                <tr aria-hidden>
                  <td colSpan={columns.length} style={{ height: offsetY, padding: 0, lineHeight: 0 }} />
                </tr>
              )}
              {slice.map((en, i) => {
                const rIdx = startIndex + i;
                if (en.kind === 'section') {
                  return (
                    <GridSectionHeader
                      key={en.key}
                      label={en.label}
                      colSpan={columns.length}
                      collapsible={en.collapsible}
                      collapsed={collapsed.has(en.sectionId)}
                      onToggle={() => toggleSection(en.sectionId)}
                      density={density}
                    />
                  );
                }
                return (
                  <GridDataRow
                    key={en.row.id}
                    row={en.row}
                    rowIndex1={rIdx + 1 + top.length}
                    columns={columns}
                    columnWidths={columnWidths}
                    frozenLeft={frozenLeft}
                    density={density}
                    isInRange={sel.isInRange}
                    isActive={sel.isActive}
                    isEditing={isCellEditing}
                    mode={edit.mode}
                    draft={edit.draft}
                    onDraft={edit.setDraft}
                    onEditorKey={e => {
                      if (e.key === 'Enter' && e.shiftKey) e.preventDefault();
                    }}
                    onCellMouseDown={onCellDown}
                    onCellMouseEnter={onCellEnter}
                    readOnly={(r, c) => roCell(r, c)}
                    readOnlyHint={r => (r.computed ? 'Derived from source' : undefined)}
                    error={(a, c) => cellErr[keyCell(a, c)]}
                    showBulkHint={showBulkHint}
                    entitySearchTourId={entitySearchTourId}
                    onContextMenu={e => {
                      e.preventDefault();
                      setCtx({ x: e.clientX, y: e.clientY, rowId: en.row.id });
                    }}
                  />
                );
              })}
              {Math.max(0, totalHeight - endIndex * rH) > 0 && (
                <tr aria-hidden>
                  <td
                    colSpan={columns.length}
                    style={{
                      height: Math.max(0, totalHeight - endIndex * rH),
                      padding: 0,
                    }}
                  />
                </tr>
              )}
              {bottom.map(tr => (
                <GridDataRow
                  key={tr.id}
                  row={tr}
                  rowIndex1={displayFlat.length + top.length + 1}
                  columns={columns}
                  columnWidths={columnWidths}
                  frozenLeft={frozenLeft}
                  density={density}
                  isInRange={sel.isInRange}
                  isActive={sel.isActive}
                  isEditing={isCellEditing}
                  mode={edit.mode}
                  draft={edit.draft}
                  onDraft={edit.setDraft}
                  onEditorKey={() => undefined}
                  onCellMouseDown={onCellDown}
                  onCellMouseEnter={onCellEnter}
                  readOnly={(r, c) => roCell(r, c)}
                  error={() => null}
                  showBulkHint={() => false}
                  entitySearchTourId={entitySearchTourId}
                />
              ))}
            </GridBody>
          </table>
        </div>
      </div>
      <div ref={liveRef} className="sr-only" aria-live="polite" />
      {bulkErr && (
        <div className="px-2 py-1 text-xs" style={{ color: 'var(--color-lp-error)' }}>
          {bulkErr}
        </div>
      )}
      {ctx &&
        createPortal(
          <div
            className="fixed z-[200] min-w-48 rounded-lg border py-1 shadow-lg"
            style={{
              top: ctx.y,
              left: ctx.x,
              background: 'var(--lp-bg)',
              borderColor: 'var(--lp-border)',
            }}
            role="menu"
          >
            {onRowOpen && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  const r = rows.find(x => x.id === ctx.rowId);
                  if (r) onRowOpen(r.data);
                  setCtx(null);
                }}
              >
                Open context
              </button>
            )}
            {onRowDelete && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onRowDelete(ctx.rowId);
                  setCtx(null);
                }}
              >
                Delete
              </button>
            )}
            {onRowDuplicate && (
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onRowDuplicate(ctx.rowId);
                  setCtx(null);
                }}
              >
                Duplicate
              </button>
            )}
            {contextMenuItems?.(rows.find(x => x.id === ctx.rowId)!).map(m => (
              <button
                key={m.id}
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  m.onSelect();
                  setCtx(null);
                }}
              >
                {m.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
