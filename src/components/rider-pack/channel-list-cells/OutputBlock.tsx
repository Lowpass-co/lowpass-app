'use client';

/* ============================================
   LOWPASS — <OutputBlock> + OUTPUT_GRID (§CL-FIX-7)

   Per-output-row component. Output rows now number independently
   of inputs (migration 115: UNIQUE (section_id, row_kind,
   row_index)) and carry the v2 column set:

     # | NAME | DESCRIPTION | STEREO? | POSITION | NOTES

   - NAME        → output_item   (the IEM device / send)
   - DESCRIPTION → output_description (renamed from
                   output_destination; backfilled by migration 115)
   - STEREO?     → output_is_stereo (binary toggle). When on, the
                   row claims two positions — the POSITION cell's
                   placeholder shows the derived "N+(N+1)".
   - POSITION    → output_position (free text; overrides the
                   derived stereo/mono placeholder)
   - NOTES       → output_notes

   output_destination / output_qty are retained in the DB (one
   tour to confirm the rename) but no longer rendered.

   Keyboard / persistence follow ChannelBlock: per-row
   useDebouncedSave; NavCell Enter-down / Esc-revert.
   ============================================ */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { Check } from 'lucide-react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import * as ch from '@/lib/rider-packs/channel-list';
import type { ChannelListRow } from '@/lib/rider-packs/types';
import { NavCell } from '@/lib/hooks/useCellNav';

/* §CL-FIX-7 — output sub-grid tracks: # | NAME | DESCRIPTION |
   STEREO? | POSITION | NOTES | actions. */
export const OUTPUT_GRID: CSSProperties = {
  gridTemplateColumns:
    '32px minmax(8rem,1.4fr) minmax(7rem,1.2fr) 4.5rem minmax(4rem,0.6fr) minmax(6rem,1.1fr) 4.5rem',
};

/* Five focusable cells: NAME, DESCRIPTION, STEREO?, POSITION,
   NOTES. # is display-only; actions hold delete. */
export const OUTPUT_COL_COUNT = 5;

interface OutputBlockProps {
  row: ChannelListRow;
  outputRowIdx: number;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
}

export function OutputBlock({ row, outputRowIdx, onUpdateLocal, onRefresh }: OutputBlockProps) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from server when no edit is in flight (matches ChannelBlock)
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

  /* Pre-focus snapshots for Esc-revert. */
  const nameSnapRef = useRef<string>(local.output_item ?? '');
  const descSnapRef = useRef<string>(local.output_description ?? '');
  const posSnapRef = useRef<string>(local.output_position ?? '');
  const notesSnapRef = useRef<string>(local.output_notes ?? '');

  /* Derived position placeholder. Stereo rows suggest the pair
     N+(N+1); mono rows suggest N. row.row_index is the
     independent output number. */
  const positionPlaceholder = local.output_is_stereo
    ? `${row.row_index}+${row.row_index + 1}`
    : `${row.row_index}`;

  const fieldClass =
    'w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40';

  return (
    <div
      className="grid w-full min-h-10 items-center gap-0 border-b last:border-b-0"
      style={{ ...OUTPUT_GRID, borderColor: 'var(--lp-border-light)' }}
    >
      {/* # — independent output number (read-only). Stereo rows
          show the claimed pair. */}
      <div className="font-mono text-[11px] tabular-nums pl-2" style={{ color: 'var(--lp-text-tertiary)' }}>
        {local.output_is_stereo ? `${row.row_index}+${row.row_index + 1}` : row.row_index}
      </div>

      {/* NAME (col 0) */}
      <NavCell row={outputRowIdx} col={0} onCancelEdit={() => queue({ output_item: nameSnapRef.current })}>
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_item ?? ''}
            onFocus={() => {
              nameSnapRef.current = local.output_item ?? '';
            }}
            onChange={(e) => queue({ output_item: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder="PSM1000 w/ P10R"
            className={fieldClass}
            title={local.output_item ?? ''}
          />
        </div>
      </NavCell>

      {/* DESCRIPTION (col 1) */}
      <NavCell row={outputRowIdx} col={1} onCancelEdit={() => queue({ output_description: descSnapRef.current })}>
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_description ?? ''}
            onFocus={() => {
              descSnapRef.current = local.output_description ?? '';
            }}
            onChange={(e) => queue({ output_description: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder="SL MON / DRIVE LOOM"
            className={fieldClass}
            title={local.output_description ?? ''}
          />
        </div>
      </NavCell>

      {/* STEREO? (col 2) — binary toggle. */}
      <NavCell row={outputRowIdx} col={2}>
        <div className="flex items-center justify-center self-center">
          <button
            type="button"
            role="switch"
            aria-checked={local.output_is_stereo}
            aria-label={`Mark output ${row.row_index} as stereo`}
            title="Stereo pair (claims two positions)"
            onClick={() => {
              queue({ output_is_stereo: !local.output_is_stereo });
              void saveRow.flush();
            }}
            className="flex h-7 w-7 items-center justify-center rounded border hover:bg-lp-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
            style={{
              background: local.output_is_stereo ? 'var(--color-lp-orange)' : 'var(--lp-bg)',
              borderColor: local.output_is_stereo ? 'var(--color-lp-orange)' : 'var(--lp-border)',
              transition: 'background-color 150ms ease-out, border-color 200ms ease-out',
            }}
          >
            {local.output_is_stereo ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.5} style={{ color: 'var(--lp-text-inverse)' }} />
            ) : (
              <span className="text-[9px] font-bold text-lp-text-tertiary">ST</span>
            )}
          </button>
        </div>
      </NavCell>

      {/* POSITION (col 3) — free text; placeholder shows the
          derived mono/stereo position. */}
      <NavCell row={outputRowIdx} col={3} onCancelEdit={() => queue({ output_position: posSnapRef.current })}>
        <div className="min-w-0 px-1 self-center">
          <input
            type="text"
            value={local.output_position ?? ''}
            onFocus={() => {
              posSnapRef.current = local.output_position ?? '';
            }}
            onChange={(e) => queue({ output_position: e.target.value })}
            onBlur={() => void saveRow.flush()}
            placeholder={positionPlaceholder}
            className={`${fieldClass} text-center tabular-nums`}
            title={local.output_position ?? positionPlaceholder}
          />
        </div>
      </NavCell>

      {/* NOTES (col 4) */}
      <NavCell row={outputRowIdx} col={4} onCancelEdit={() => queue({ output_notes: notesSnapRef.current })}>
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
            className={fieldClass}
            title={local.output_notes ?? ''}
          />
        </div>
      </NavCell>

      {/* Delete action — mouse furniture, skipped from the tab
          order (tabIndex={-1}) so Tab walks cells only, matching
          the input grid's Copy/Del treatment. */}
      <div className="flex justify-end pr-1 self-center">
        <button
          type="button"
          tabIndex={-1}
          className="text-[10px] font-semibold whitespace-nowrap"
          style={{ color: 'var(--color-lp-error)' }}
          onClick={async () => {
            if (!confirm('Delete this output row?')) return;
            /* §CL-1 — sectionId lets the delete close the output
               sequence behind it (outputs number 1..M independently). */
            await ch.deleteRow(createClient(), row.id, row.section_id);
            await onRefresh();
          }}
        >
          Del
        </button>
      </div>
    </div>
  );
}
