/* ============================================
   LOWPASS — Budget grid sizing hook (Phase C)

   Spreadsheet-grade resizing for <BudgetSpreadsheetView>:
   - per-column widths (drag a header-edge handle)
   - canvas width (drag the right edge to pull the grid wide)

   Both persist per-tour in localStorage, mirroring the existing
   `lp-budget-group-by:` pattern. Pointer math is plain DOM (no deps).
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

const COL_WIDTHS_PREFIX = 'lp-budget-col-widths:';
const CANVAS_WIDTH_PREFIX = 'lp-budget-canvas-width:';

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
  /** Canvas max-width in px, or null for the default (container width). */
  canvasWidth: number | null;
  /** Begin a column drag from a header-edge handle. */
  startColumnResize: (key: string, e: React.PointerEvent) => void;
  /** Begin a canvas drag from the right-edge handle. */
  startCanvasResize: (e: React.PointerEvent) => void;
  /** Clear all overrides back to defaults. */
  reset: () => void;
  /** True when the user has customised any width (shows the Reset btn). */
  isCustomised: boolean;
}

const CANVAS_MIN = 720;
const CANVAS_MAX = 2400;

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
  const [canvasWidth, setCanvasWidth] = useState<number | null>(null);

  // Restore persisted prefs on mount / tour change.
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
      const rawCanvas = window.localStorage.getItem(CANVAS_WIDTH_PREFIX + tourId);
      if (rawCanvas) {
        const n = Number(rawCanvas);
        if (Number.isFinite(n) && n > 0) setCanvasWidth(n);
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
  const persistCanvas = useCallback(
    (next: number | null) => {
      if (typeof window === 'undefined') return;
      if (next == null) window.localStorage.removeItem(CANVAS_WIDTH_PREFIX + tourId);
      else window.localStorage.setItem(CANVAS_WIDTH_PREFIX + tourId, String(next));
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

  const startCanvasResize = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      // Anchor to the current rendered width of the grid container.
      const container = (e.currentTarget as HTMLElement).parentElement;
      const startWidth = canvasWidth ?? container?.getBoundingClientRect().width ?? CANVAS_MIN;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const nextWidth = Math.min(
          CANVAS_MAX,
          Math.max(CANVAS_MIN, Math.round(startWidth + delta)),
        );
        setCanvasWidth(nextWidth);
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        setCanvasWidth((prev) => {
          persistCanvas(prev);
          return prev;
        });
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [canvasWidth, persistCanvas],
  );

  const reset = useCallback(() => {
    setColOverrides({});
    setCanvasWidth(null);
    persistCols({});
    persistCanvas(null);
  }, [persistCols, persistCanvas]);

  const isCustomised =
    Object.keys(colOverrides).length > 0 || canvasWidth != null;

  return {
    widthFor,
    canvasWidth,
    startColumnResize,
    startCanvasResize,
    reset,
    isCustomised,
  };
}
