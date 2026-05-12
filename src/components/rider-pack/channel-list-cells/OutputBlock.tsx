'use client';

/* ============================================
   LOWPASS — <OutputBlock> + OUTPUT_GRID (Sprint 12 §8b2)

   Per-output-row component for the channel list editor.
   Renders `row_kind='output'` rows from channel_list_rows in
   a sub-grid below the inputs.

   Output rows model IEM mixes, drive lines, send loops, etc.
   The §8 spec column set is Index | Item | Destination |
   Position | QTY | Notes — 6 cells per row, 5 of them
   focusable (Index is read-only sequence display).

   Persistence uses the same useDebouncedSave + ch.updateRow
   pattern as ChannelBlock. The save chain stays per-row so
   typing in one output doesn't fight typing in another.

   Keyboard nav follows the §8b2 matrix:
     - Tab / Shift+Tab between cells within the row, wraps to
       the next/prev row at the edges (handled by the
       <CellNavProvider> mounted by the parent editor).
     - Enter on Item / Destination / Notes — moves down one
       cell in the same column (NavCell intercepts).
     - Enter on Position (BrandedSelect trigger) — opens the
       dropdown (BrandedSelect's own handler).
     - Esc on text inputs — reverts the cell to its pre-focus
       value via the snapshot refs.
   ============================================ */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import * as ch from '@/lib/rider-packs/channel-list';
import type { ChannelListRow } from '@/lib/rider-packs/types';
import { NavCell } from '@/lib/hooks/useCellNav';
import { PositionSelectCell } from './PositionSelectCell';

/* Sprint 12 §8b2 — output sub-grid column tracks. Six cells
   plus a small actions column at the right.
     1   #            (32px, read-only sequence)
     2   Item         (1.4fr — the IEM device + capsule)
     3   Destination  (1fr — where the line is sent)
     4   Position     (minmax(4rem, 0.55fr) — same enum as inputs)
     5   QTY          (3.5rem — small int field)
     6   Notes        (1.2fr)
     7   actions      (4.5rem) */
export const OUTPUT_GRID: CSSProperties = {
  gridTemplateColumns:
    '32px minmax(8rem,1.4fr) minmax(6rem,1fr) minmax(4rem,0.55fr) 3.5rem minmax(6rem,1.2fr) 4.5rem',
};

/* Five focusable cells: Item, Destination, Position, QTY,
   Notes. Index is display-only and the actions cell holds a
   delete button (focusable via Tab but not part of the cell
   nav matrix). */
export const OUTPUT_COL_COUNT = 5;

interface OutputBlockProps {
  row: ChannelListRow;
  outputRowIdx: number;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
}

export function OutputBlock({
  row,
  outputRowIdx,
  onUpdateLocal,
  onRefresh,
}: OutputBlockProps) {
  const patchRef = useRef<Partial<ChannelListRow>>({});
  const saveRow = useDebouncedSave<number>(
    useCallback(
      async (_tick: number) => {
        void _tick;
        const p = { ...patchRef.current };
        patchRef.current = {};
        if (Object.keys(p).length === 0) return;
        await ch.updateRow(createClient(), row.id, p);
      },
      [row.id],
    ),
    400,
  );

  const [local, setLocal] = useState(row);
  useEffect(() => {
    if (saveRow.isPending()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from server when no edit is in flight (matches ChannelBlock pattern)
    setLocal(row);
  }, [row, saveRow]);

  const queue = (patch: Partial<ChannelListRow>) => {
    patchRef.current = { ...patchRef.current, ...patch };
    setLocal((l) => {
      const n = { ...l, ...patch } as ChannelListRow;
      onUpdateLocal(n);
      return n;
    });
    saveRow.schedule(0);
  };

  /* Pre-focus snapshots for the Esc-revert behaviour. The
     NavCell wrapper's onCancelEdit fires on Escape; we restore
     the value from the matching ref. */
  const itemSnapRef = useRef<string>(local.output_item ?? '');
  const destSnapRef = useRef<string>(local.output_destination ?? '');
  const notesSnapRef = useRef<string>(local.output_notes ?? '');
  const qtySnapRef = useRef<number | null>(local.output_qty);

  return (
    <div
      className="grid w-full min-h-10 items-center gap-0 border-b last:border-b-0"
      style={{ ...OUTPUT_GRID, borderColor: 'var(--lp-border-light)' }}
    >
      {/* Index (read-only, not focusable). */}
      <div
        className="font-mono text-[11px] tabular-nums pl-2"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        {row.row_index}
      </div>

      {/* Item (col 0) — text input. */}
      <NavCell
        row={outputRowIdx}
        col={0}
        onCancelEdit={() => queue({ output_item: itemSnapRef.current })}
      >
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_item ?? ''}
            onFocus={() => {
              itemSnapRef.current = local.output_item ?? '';
            }}
            onChange={(e) => queue({ output_item: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder="PSM1000 w/ P10R"
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            title={local.output_item ?? ''}
          />
        </div>
      </NavCell>

      {/* Destination (col 1) — text input. */}
      <NavCell
        row={outputRowIdx}
        col={1}
        onCancelEdit={() => queue({ output_destination: destSnapRef.current })}
      >
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_destination ?? ''}
            onFocus={() => {
              destSnapRef.current = local.output_destination ?? '';
            }}
            onChange={(e) => queue({ output_destination: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder="SL MON / DRIVE LOOM"
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            title={local.output_destination ?? ''}
          />
        </div>
      </NavCell>

      {/* Position (col 2) — enum select. Reuses the input
          grid's stage-position enum. */}
      <NavCell row={outputRowIdx} col={2}>
        <div className="min-w-0 px-1 self-center">
          <PositionSelectCell
            value={local.position}
            onChange={(v) => {
              queue({ position: v });
              void saveRow.flush();
            }}
            ariaLabel={`Stage position for output ${row.row_index}`}
          />
        </div>
      </NavCell>

      {/* QTY (col 3) — small int input. */}
      <NavCell
        row={outputRowIdx}
        col={3}
        onCancelEdit={() => queue({ output_qty: qtySnapRef.current })}
      >
        <div className="min-w-0 px-1 self-center">
          <input
            type="number"
            min={0}
            step={1}
            value={local.output_qty ?? ''}
            onFocus={() => {
              qtySnapRef.current = local.output_qty;
            }}
            onChange={(e) => {
              const v = e.target.value;
              queue({
                output_qty: v === '' ? null : Math.max(0, Math.floor(Number(v))),
              });
            }}
            onBlur={() => void saveRow.flush()}
            placeholder="0"
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40 text-center tabular-nums"
          />
        </div>
      </NavCell>

      {/* Notes (col 4) — text input. */}
      <NavCell
        row={outputRowIdx}
        col={4}
        onCancelEdit={() => queue({ output_notes: notesSnapRef.current })}
      >
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_notes ?? ''}
            onFocus={() => {
              notesSnapRef.current = local.output_notes ?? '';
            }}
            onChange={(e) => queue({ output_notes: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder="…"
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            title={local.output_notes ?? ''}
          />
        </div>
      </NavCell>

      {/* Delete action. Tab-reachable but outside the cell
          nav matrix (no NavCell wrapper). */}
      <div className="flex justify-end pr-1 self-center">
        <button
          type="button"
          className="text-[10px] font-semibold whitespace-nowrap"
          style={{ color: 'var(--color-lp-error)' }}
          onClick={async () => {
            if (!confirm('Delete this output row?')) return;
            await ch.deleteRow(createClient(), row.id);
            await onRefresh();
          }}
        >
          Del
        </button>
      </div>
    </div>
  );
}
