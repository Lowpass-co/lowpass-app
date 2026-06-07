/* ============================================
   LOWPASS — Budget grid sizing hook (Phase C)

   Per-column drag-to-resize for <BudgetSpreadsheetView>:
   - per-column widths (drag a header-edge handle), min-clamped
   - persisted per-tour in localStorage (`lp-budget-col-widths:`)

   The old whole-grid "canvas width" handle is gone — the grid is
   full-width now — so this hook is column widths only. Pointer math is
   plain DOM (no deps).
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const COL_WIDTHS_PREFIX = 'lp-budget-col-widths:';

/** A resizable column. `min` clamps the drag; non-resizable columns
 *  (checkbox, line number) are simply omitted from the handle set but
 *  still carry a width in the colgroup. */
export interface GridColumnDef {
  key: string;
  width: number;
  min: number;
  resizable: boolean;
}

export interface GridSizing {
  /** Effective width for a column key (override or default). */
  widthFor: (key: string) => number;
  /** Begin a column drag from a header-edge handle. */
  startColumnResize: (key: string, e: React.PointerEvent) => void;
  /** Clear all overrides back to defaults. */
  reset: () => void;
  /** True when the user has customised any width (shows the Reset btn). */
  isCustomised: boolean;
}

export function useBudgetGridSizing(
  tourId: string,
  columns: GridColumnDef[],
): GridSizing {
  const defaults = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of columns) m[c.key] = c.width;
    return m;
  }, [columns]);

  const [colOverrides, setColOverrides] = useState<Record<string, number>>({});

  // Restore persisted widths on mount / tour change.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const rawCols = window.localStorage.getItem(COL_WIDTHS_PREFIX + tourId);
      if (rawCols) {
        const parsed = JSON.parse(rawCols) as Record<string, number>;
        // Restore-from-storage on mount; renders defaults first to avoid
        // an SSR/hydration mismatch, then applies the saved widths.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed && typeof parsed === 'object') setColOverrides(parsed);
      }
    } catch {
      // Corrupt JSON — ignore and fall back to defaults.
    }
  }, [tourId]);

  const persistCols = useCallback(
    (next: Record<string, number>) => {
      if (typeof window === 'undefined') return;
      window.localStorage.setItem(COL_WIDTHS_PREFIX + tourId, JSON.stringify(next));
    },
    [tourId],
  );

  const widthFor = useCallback(
    (key: string) => colOverrides[key] ?? defaults[key] ?? 120,
    [colOverrides, defaults],
  );

  const startColumnResize = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const col = columns.find((c) => c.key === key);
      const min = col?.min ?? 48;
      const startX = e.clientX;
      const startWidth = colOverrides[key] ?? defaults[key] ?? 120;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const nextWidth = Math.max(min, Math.round(startWidth + delta));
        setColOverrides((prev) => ({ ...prev, [key]: nextWidth }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        setColOverrides((prev) => {
          persistCols(prev);
          return prev;
        });
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [columns, colOverrides, defaults, persistCols],
  );

  const reset = useCallback(() => {
    setColOverrides({});
    persistCols({});
  }, [persistCols]);

  const isCustomised = Object.keys(colOverrides).length > 0;

  return {
    widthFor,
    startColumnResize,
    reset,
    isCustomised,
  };
}
