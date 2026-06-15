'use client';

/* ============================================
   LOWPASS — useCellNav + <CellNavProvider> + <NavCell>
   (Sprint 12 §8b2)

   Grid keyboard-nav primitive for the channel list editor
   (and any future spreadsheet-shaped surface). Cells register
   themselves with their (row, col) coordinate; the provider
   exposes focusCell({ row, col }) which routes to the
   registered HTMLElement.

   Wrap each cell with <NavCell row col>. The wrapper:
     1. Uses `display: contents` so the grid layout above is
        unaffected — the wrapper itself doesn't take a grid
        track, its first focusable child does.
     2. Auto-discovers the first focusable descendant
        (input | textarea | button | [tabindex]:not(-1)) and
        registers it.
     3. Hosts the keydown handler so Enter and Escape can be
        intercepted at the cell boundary regardless of which
        inner control owns focus.

   Keyboard behaviour (matches the §8 spec):
     - Tab / Shift+Tab — browser default. Cells register in
       grid order; Tab moves left-to-right within the row and
       wraps to the next row's first cell automatically.
     - Enter — when target is a text-shaped input (TEXT,
       NUMBER, EMAIL, SEARCH, or TEXTAREA), preventDefault +
       focus { row+1, col }. For BrandedSelect triggers Enter
       opens the dropdown (the select's own handler).
     - Escape — if onCancelEdit is supplied, fire it +
       blur the focused element. Cells with internal edit
       state use this to revert to the pre-focus value.
     - Inside an open BrandedSelect dropdown the select's
       own ↑↓ / Enter / Esc handlers take over (BrandedSelect
       calls stopPropagation on those keys, so this hook's
       Enter-moves-down never fires).

   Two nav islands: input grid and output grid each mount
   their own CellNavProvider. Cross-grid navigation falls
   through to native Tab. That keeps wrap-around per-grid
   simple.
   ============================================ */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';

export interface CellCoord {
  row: number;
  col: number;
}

interface CellNavContextValue {
  /** Cells call this on mount with their element and on
   *  unmount with null. The provider keyed by `row:col`. */
  register: (coord: CellCoord, el: HTMLElement | null) => void;
  /** Focus the cell at the given coordinate. Wraps col over
   *  row edges. Returns true when the focus landed. */
  focusCell: (coord: CellCoord) => boolean;
  /** Total columns per row — used by Tab-wrap. The provider's
   *  consumer sets this when mounting the grid. */
  colCount: number;
}

const CellNavContext = createContext<CellNavContextValue | null>(null);

interface CellNavProviderProps {
  /** Number of columns in the grid this provider serves. */
  colCount: number;
  children: ReactNode;
}

export function CellNavProvider({ colCount, children }: CellNavProviderProps) {
  const cellsRef = useRef(new Map<string, HTMLElement>());

  const register = useCallback((coord: CellCoord, el: HTMLElement | null) => {
    const key = `${coord.row}:${coord.col}`;
    if (el) cellsRef.current.set(key, el);
    else cellsRef.current.delete(key);
  }, []);

  const focusCell = useCallback(
    (coord: CellCoord): boolean => {
      let { row, col } = coord;
      /* Wrap horizontally: col past the right edge bumps to
         row+1, col 0; col below 0 bumps to row-1, last col. */
      if (col >= colCount) {
        col = 0;
        row += 1;
      } else if (col < 0) {
        col = colCount - 1;
        row -= 1;
      }
      if (row < 0) return false;
      const key = `${row}:${col}`;
      const el = cellsRef.current.get(key);
      if (!el) return false;
      el.focus();
      /* Convenience: select all on text inputs so the new
         cell is immediately overwriteable. */
      if (
        el instanceof HTMLInputElement &&
        (el.type === 'text' || el.type === 'search' || el.type === 'email' || el.type === 'number')
      ) {
        el.select();
      } else if (el instanceof HTMLTextAreaElement) {
        el.select();
      }
      return true;
    },
    [colCount],
  );

  const value = useMemo<CellNavContextValue>(
    () => ({ register, focusCell, colCount }),
    [register, focusCell, colCount],
  );

  return <CellNavContext.Provider value={value}>{children}</CellNavContext.Provider>;
}

/** Hook for internal use by <NavCell>. Throws if used outside
 *  a provider. */
function useCellNavOrThrow(): CellNavContextValue {
  const ctx = useContext(CellNavContext);
  if (!ctx) {
    throw new Error('NavCell / useCellNav must be used inside <CellNavProvider>');
  }
  return ctx;
}

interface NavCellProps {
  row: number;
  col: number;
  /** Fired when Escape is pressed inside this cell. The cell
   *  is expected to revert any in-progress edit and blur. */
  onCancelEdit?: () => void;
  children: ReactNode;
}

/** Wraps a cell, discovers its first focusable descendant, and
 *  registers it. Hosts the Enter / Escape keydown handlers so
 *  the cell's children don't need to repeat the logic. */
export function NavCell({ row, col, onCancelEdit, children }: NavCellProps) {
  const { register, focusCell } = useCellNavOrThrow();
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    /* Discover the first focusable descendant. Order matters:
       focus moves Tab-wise to the first one. Skip
       tabindex="-1" since those are mouse-only controls. */
    const focusable = wrapper.querySelector<HTMLElement>(
      'input, textarea, select, button, [tabindex]:not([tabindex="-1"])',
    );
    register({ row, col }, focusable ?? null);
    return () => register({ row, col }, null);
  }, [row, col, register]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    const textEl =
      target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement
        ? target
        : null;
    const isText =
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLInputElement &&
        (target.type === 'text' ||
          target.type === 'search' ||
          target.type === 'email' ||
          target.type === 'number'));

    /* Arrow-key cell nav (canonical-grid parity). Scoped to text-shaped cells
       so the smart selects keep their own ↑↓ option-nav (BrandedSelect
       stopsPropagation on its keys while open, so this never fires there).
       ←/→ only jump cells when the caret is at the text edge — mid-text they
       move the cursor as usual, so editing is untouched. */
    if (isText && !e.nativeEvent.isComposing) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusCell({ row: row - 1, col });
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusCell({ row: row + 1, col });
        return;
      }
      if (e.key === 'ArrowLeft' && textEl) {
        const atStart = (textEl.selectionStart ?? 0) === 0 && (textEl.selectionEnd ?? 0) === 0;
        if (atStart) {
          e.preventDefault();
          focusCell({ row, col: col - 1 });
          return;
        }
      }
      if (e.key === 'ArrowRight' && textEl) {
        const len = textEl.value.length;
        const atEnd = (textEl.selectionStart ?? 0) === len && (textEl.selectionEnd ?? 0) === len;
        if (atEnd) {
          e.preventDefault();
          focusCell({ row, col: col + 1 });
          return;
        }
      }
    }

    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      if (isText) {
        e.preventDefault();
        focusCell({ row: row + 1, col });
      }
    } else if (e.key === 'Escape') {
      if (onCancelEdit) {
        onCancelEdit();
        const target = e.target as HTMLElement;
        target.blur?.();
      }
    }
  };

  return (
    <div
      ref={wrapperRef}
      style={{ display: 'contents' }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  );
}

/** Public hook for cells that want to imperatively focus a
 *  neighbour. Most cells should use <NavCell> + native Tab
 *  instead of this — exposed for the rare case where a cell
 *  needs to focus a sibling after an internal action. */
export function useCellNav() {
  return useCellNavOrThrow();
}
