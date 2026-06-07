/* ============================================
   LOWPASS — Shared column-width hook (grid column resize)

   Per-column drag-to-resize + persistence for the shared primitives
   (<SpreadsheetGrid>, <DataTable>), generalised from the budget grid's
   useBudgetGridSizing column logic. No canvas/whole-grid width — columns
   only. Pointer math is plain DOM (no deps).

   Pass `storageKey` to persist widths (e.g. per-tour); omit it for
   ephemeral, in-memory resizing. Hook = inherently client; lives in a
   'use client' module, which is fine (it's never called server-side).
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

export interface ColumnWidthSpec {
  key: string;
  /** Default width in px. */
  width: number;
  /** Minimum width while dragging (clamp). Defaults to 48. */
  min?: number;
  /** When false the column has no drag handle (still carries a width). */
  resizable?: boolean;
}

export interface ColumnWidths {
  widthFor: (key: string) => number;
  startResize: (key: string, e: React.PointerEvent) => void;
  reset: () => void;
  isCustomised: boolean;
}

export function useColumnWidths(
  columns: ColumnWidthSpec[],
  storageKey?: string | null,
): ColumnWidths {
  const { defaults, mins } = useMemo(() => {
    const d: Record<string, number> = {};
    const m: Record<string, number> = {};
    for (const c of columns) {
      d[c.key] = c.width;
      m[c.key] = c.min ?? 48;
    }
    return { defaults: d, mins: m };
  }, [columns]);

  const [overrides, setOverrides] = useState<Record<string, number>>({});

  // Restore persisted widths on mount / key change (defaults first, then
  // apply saved — avoids an SSR/hydration mismatch).
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, number>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (parsed && typeof parsed === 'object') setOverrides(parsed);
      }
    } catch {
      /* corrupt JSON — fall back to defaults */
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: Record<string, number>) => {
      if (!storageKey || typeof window === 'undefined') return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage blocked — preference is ephemeral */
      }
    },
    [storageKey],
  );

  const widthFor = useCallback(
    (key: string) => overrides[key] ?? defaults[key] ?? 120,
    [overrides, defaults],
  );

  const startResize = useCallback(
    (key: string, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const min = mins[key] ?? 48;
      const startX = e.clientX;
      const startWidth = overrides[key] ?? defaults[key] ?? 120;

      const onMove = (ev: PointerEvent) => {
        const delta = ev.clientX - startX;
        const nextWidth = Math.max(min, Math.round(startWidth + delta));
        setOverrides((prev) => ({ ...prev, [key]: nextWidth }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        document.body.style.removeProperty('cursor');
        document.body.style.removeProperty('user-select');
        setOverrides((prev) => {
          persist(prev);
          return prev;
        });
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [mins, overrides, defaults, persist],
  );

  const reset = useCallback(() => {
    setOverrides({});
    persist({});
  }, [persist]);

  const isCustomised = Object.keys(overrides).length > 0;

  return { widthFor, startResize, reset, isCustomised };
}
