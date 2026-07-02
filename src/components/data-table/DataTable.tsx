'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import { useAppDensity } from '@/lib/density/appDensity';
import { useColumnWidths } from '@/lib/grid/useColumnWidths';
import type { DataTableProps } from './types';
import { DataTableEmpty } from './DataTableEmpty';
import { DataTableHeader, collectFrozenOffsets } from './DataTableHeader';
import { DataTablePagination } from './DataTablePagination';
import { DataTableRow } from './DataTableRow';
import { DataTableSkeleton } from './DataTableSkeleton';
import { DataTableToolbar } from './DataTableToolbar';
import { applySearch, rowPassesFilters, sortRows } from './utils';
import type { ColumnDef, FilterValue } from './types';

const SELECT_W = 40;
const DEFAULT_PAGE = 50;
const SLASH = '/';

function isEditableTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const name = (el as HTMLInputElement).tagName;
  if (name === 'INPUT' || name === 'TEXTAREA' || name === 'SELECT' || (el as HTMLElement).isContentEditable) {
    return true;
  }
  return (el as HTMLElement).closest?.('input,textarea,select,[contenteditable]') != null;
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return dv;
}

export function DataTable<T>(props: DataTableProps<T>) {
  const {
    rows,
    columns: columnsIn,
    rowKey,
    density: densityProp,
    selectable = false,
    selectedIds: selectedIdsP,
    onSelectionChange,
    selectionActions,
    onRowClick,
    rowClassName,
    searchable: searchableP = true,
    searchPlaceholder = 'Search…',
    searchAccessor,
    pageSize = DEFAULT_PAGE,
    pagination: paginationP = 'paged',
    onLoadMore,
    hasMore = false,
    emptyState,
    stickyHeader = true,
    containerHeight = 'auto',
    columnWidthsKey,
    ariaLabel = 'Data table',
    flat = false,
  } = props;

  // Grid system Phase 1 — density follows the one app-wide preference
  // unless a caller pins it explicitly.
  const { density: appDensity } = useAppDensity();
  const density = densityProp ?? appDensity;

  const isLoading = rows === undefined;
  const [search, setSearch] = useState('');
  const searchDebounced = useDebouncedValue(search, 150);
  const [filterState, setFilterState] = useState<Record<string, FilterValue | undefined>>({});
  const [sortKey, setSortKey] = useState<{ colId: string | null; dir: 'asc' | 'desc' | null }>({
    colId: null,
    dir: null,
  });
  const [page, setPage] = useState(0);
  const [focusIndex, setFocusIndex] = useState(0);
  const anchorIndex = useRef<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusRowRef = useRef<HTMLTableRowElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selectedIdsP ?? []), [selectedIdsP]);

  const setSelectedIds = useCallback(
    (next: string[]) => {
      onSelectionChange?.(next);
    },
    [onSelectionChange]
  );

  // Per-column drag-to-resize, opt-in + persisted via columnWidthsKey.
  // When off, columns keep their declared widths (no handles) so existing
  // tables are unchanged.
  const resizable = columnWidthsKey != null;
  const colSpecs = useMemo(
    () =>
      columnsIn.map(c => ({
        key: c.id,
        width:
          typeof c.width === 'number'
            ? c.width
            : typeof c.width === 'string' && c.width.endsWith('px')
              ? parseFloat(c.width) || 160
              : 160,
        min: c.minWidth ?? 80,
        resizable: true,
      })),
    [columnsIn]
  );
  const {
    widthFor,
    hasOverride,
    startResize,
    reset: resetWidths,
    isCustomised: widthsCustomised,
  } = useColumnWidths(colSpecs, resizable ? columnWidthsKey : null);
  // The flexible primary column absorbs the leftover width (width:auto,
  // min ~200px) unless the user has dragged it. Consumers mark it `flex`.
  const FLEX_MIN = 200;
  const flexColId = useMemo(
    () => columnsIn.find(c => c.flex)?.id ?? null,
    [columnsIn]
  );
  const columns = useMemo(
    () =>
      resizable
        ? columnsIn.map(c => ({
            ...c,
            width:
              c.id === flexColId && !hasOverride(c.id) ? 'auto' : widthFor(c.id),
          }))
        : columnsIn,
    [resizable, columnsIn, widthFor, flexColId, hasOverride]
  );
  // Table minWidth when resizing — the flex column counts its min.
  const resizeTableWidth = useMemo(
    () =>
      columnsIn.reduce((sum, c) => {
        if (c.id === flexColId && !hasOverride(c.id)) return sum + FLEX_MIN;
        return sum + widthFor(c.id);
      }, 0),
    [columnsIn, flexColId, hasOverride, widthFor]
  );
  const searchable = searchableP && !isLoading;
  const pagination = paginationP;

  const searchFiltered = useMemo(() => {
    if (isLoading || !rows) return [] as T[];
    return applySearch(rows, searchDebounced, columns, searchAccessor);
  }, [isLoading, rows, searchDebounced, columns, searchAccessor]);

  const fullyFiltered = useMemo(() => {
    return searchFiltered.filter(r => rowPassesFilters(r, columns, filterState));
  }, [searchFiltered, columns, filterState]);

  const sortColumn = useMemo(
    () => (sortKey.colId ? columns.find(c => c.id === sortKey.colId) : undefined),
    [columns, sortKey.colId]
  );

  const sorted = useMemo(() => {
    if (!sortKey.colId || !sortKey.dir || !sortColumn) {
      return fullyFiltered;
    }
    return sortRows(fullyFiltered, sortColumn, sortKey.dir);
  }, [fullyFiltered, sortKey, sortColumn]);

  const totalRows = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const safePage = Math.min(page, totalPages - 1);

  const pagedRows = useMemo(() => {
    if (pagination === 'none' || pagination === 'infinite') {
      return sorted;
    }
    const start = safePage * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize, pagination]);

  const displayRows = pagedRows;

  const focusIndexSafe =
    displayRows.length === 0 ? 0 : Math.min(Math.max(0, focusIndex), displayRows.length - 1);

  useLayoutEffect(() => {
    const el = focusRowRef.current;
    if (el && !isLoading) {
      el.focus();
    }
  }, [focusIndexSafe, isLoading]);

  const frozenLeft = useMemo(
    () => collectFrozenOffsets({ columns, selectable, selectWidth: SELECT_W }),
    [columns, selectable]
  );

  const pageIds = useMemo(
    () => displayRows.map(r => rowKey(r)),
    [displayRows, rowKey]
  );

  const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedSet.has(id));
  const somePageSelected = pageIds.some(id => selectedSet.has(id)) && !allPageSelected;

  const onSortClick = useCallback(
    (columnId: string) => {
      const col = columns.find(c => c.id === columnId);
      if (!col?.sortable) return;
      setPage(0);
      setSortKey(prev => {
        if (prev.colId !== columnId) {
          return { colId: columnId, dir: 'asc' };
        }
        if (prev.dir === 'asc') {
          return { colId: columnId, dir: 'desc' };
        }
        if (prev.dir === 'desc') {
          return { colId: null, dir: null };
        }
        return { colId: columnId, dir: 'asc' };
      });
    },
    [columns]
  );

  const toggleId = (id: string, on: boolean) => {
    const next = new Set(selectedIdsP ?? []);
    if (on) next.add(id);
    else next.delete(id);
    setSelectedIds([...next]);
  };

  const onCheckbox = (e: MouseEvent, index: number, id: string) => {
    e.stopPropagation();
    if (e.shiftKey && anchorIndex.current != null) {
      const a = Math.min(anchorIndex.current, index);
      const b = Math.max(anchorIndex.current, index);
      const next = new Set(selectedIdsP ?? []);
      for (let i = a; i <= b; i++) {
        if (pageIds[i]) {
          next.add(pageIds[i]);
        }
      }
      setSelectedIds([...next]);
    } else {
      anchorIndex.current = index;
      toggleId(id, !selectedSet.has(id));
    }
  };

  const onSelectAll = () => {
    const next = new Set(selectedIdsP ?? []);
    if (allPageSelected) {
      for (const id of pageIds) next.delete(id);
    } else {
      for (const id of pageIds) next.add(id);
    }
    setSelectedIds([...next]);
  };

  const onFilterChange = (id: string, v: FilterValue | undefined) => {
    setPage(0);
    setFilterState(s => (v === undefined ? { ...s, [id]: undefined } : { ...s, [id]: v }));
  };


  const moveFocus = (delta: number) => {
    if (displayRows.length === 0) return;
    setFocusIndex(prev => {
      const c = Math.min(Math.max(0, prev), displayRows.length - 1);
      const n = c + delta;
      return Math.max(0, Math.min(n, displayRows.length - 1));
    });
  };

  const handleRowKey = (e: KeyboardEvent, row: T) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveFocus(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick?.(row);
    }
  };

  useEffect(() => {
    const onDocKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== SLASH) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    };
    document.addEventListener('keydown', onDocKey);
    return () => document.removeEventListener('keydown', onDocKey);
  }, []);

  useEffect(() => {
    if (pagination !== 'infinite' || !onLoadMore || !hasMore) return;
    const root = scrollRef.current;
    const el = sentinelRef.current;
    if (!root || !el) return;
    const ro = new IntersectionObserver(
      ([ent]) => {
        if (ent.isIntersecting) {
          onLoadMore();
        }
      },
      { root, rootMargin: '80px', threshold: 0.01 }
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [pagination, onLoadMore, hasMore, displayRows.length, sorted.length]);

  const skeletonColCount = (selectable ? 1 : 0) + columns.length;

  const showEmpty = !isLoading && totalRows === 0;

  return (
    <div
      className={`mx-auto flex min-h-0 w-full flex-1 flex-col overflow-hidden${flat ? '' : ' rounded-xl'}`}
      style={{
        /* Raised panel — an elevated surface distinct from the page
           (--lp-bg) + a visible shadow, so lists pop on dark where the
           bg/surface contrast is the elevation cue. Capped + centred like
           the spreadsheet panels so ultra-wide screens don't strand the
           name column. `flat` (revamp #21) drops the panel chrome so the
           table sits ON the page like the Phase-1 grid family. */
        border: flat ? 'none' : '1px solid var(--lp-border-strong)',
        backgroundColor: flat ? 'transparent' : 'var(--lp-surface)',
        boxShadow: flat ? 'none' : 'var(--lp-shadow-md)',
        fontVariantNumeric: 'tabular-nums',
        maxWidth: 1600,
      }}
      role="region"
      aria-label={ariaLabel}
    >
      <DataTableToolbar
        columns={columns}
        filterState={filterState}
        onFilterStateChange={onFilterChange}
        searchable={searchable}
        searchPlaceholder={searchPlaceholder}
        searchValue={search}
        onSearchValueChange={q => {
          setPage(0);
          setSearch(q);
        }}
        searchInputRef={searchInputRef}
        selectable={!!selectable && !!onSelectionChange}
        selectedCount={selectedIdsP?.length ?? 0}
        displayTotal={isLoading ? 0 : totalRows}
        selectionActions={selectionActions}
        rightExtra={
          resizable && widthsCustomised ? (
            <button
              type="button"
              onClick={resetWidths}
              className="btn-transition rounded-md border px-2 py-0.5"
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
          ) : null
        }
      />

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        style={containerHeight === 'auto' ? undefined : { height: containerHeight, maxHeight: containerHeight }}
        tabIndex={-1}
      >
        {isLoading ? (
          <DataTableSkeleton columns={skeletonColCount} density={density} />
        ) : showEmpty ? (
          <DataTableEmpty message={emptyState ?? 'No results'} />
        ) : (
          <table
            className="w-full border-collapse"
            style={
              resizable
                ? {
                    // Fixed layout so the flex column absorbs the leftover
                    // and the others keep their exact resizable widths.
                    tableLayout: 'fixed',
                    width: '100%',
                    minWidth: resizeTableWidth,
                  }
                : { minWidth: 'max(100%, 600px)' }
            }
            role="table"
            aria-label={ariaLabel}
          >
            <DataTableHeader
              columns={columns as ColumnDef<T>[]}
              selectable={!!selectable && !!onSelectionChange}
              density={density}
              sortColumnId={sortKey.colId}
              sortDirection={sortKey.dir}
              onSortClick={onSortClick}
              headerCheckbox={
                selectable && onSelectionChange
                  ? {
                      checked: allPageSelected,
                      indeterminate: somePageSelected,
                      onChange: onSelectAll,
                    }
                  : null
              }
              frozenLeft={frozenLeft}
              stickyHeader={stickyHeader}
              selectColWidth={SELECT_W}
              resizable={resizable}
              onStartResize={startResize}
            />
            <tbody>
              {displayRows.map((row, i) => {
                const id = rowKey(row);
                const isFocused = i === focusIndexSafe;
                return (
                  <DataTableRow
                    key={id}
                    row={row}
                    rowId={id}
                    focusedRef={isFocused ? focusRowRef : undefined}
                    tabIndex={isFocused ? 0 : -1}
                    rowClassName={rowClassName}
                    columns={columns}
                    selectable={!!selectable && !!onSelectionChange}
                    selected={selectedSet.has(id)}
                    focused={isFocused}
                    density={density}
                    onRowClick={onRowClick}
                    onRowFocus={() => setFocusIndex(i)}
                    onCheckbox={e => onCheckbox(e, i, id)}
                    frozenLeft={frozenLeft}
                    selectColWidth={SELECT_W}
                    onKeyDown={e => handleRowKey(e, row)}
                  />
                );
              })}
            </tbody>
          </table>
        )}

        {pagination === 'infinite' && !isLoading && !showEmpty && (
          <div
            ref={sentinelRef}
            className="h-1 w-full"
            style={{ minHeight: 4 }}
            aria-hidden
          />
        )}
      </div>

      {pagination === 'paged' && !isLoading && !showEmpty && totalRows > 0 && (
        <DataTablePagination
          total={totalRows}
          page={safePage}
          pageSize={pageSize}
          onPageChange={p => {
            setPage(p);
            setFocusIndex(0);
          }}
        />
      )}
    </div>
  );
}
