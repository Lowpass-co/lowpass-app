'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical } from 'lucide-react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import type { ChannelListRow, MicLibraryEntry, RiderPack, ResolvedSection, StageBox, SubSnake } from '@/lib/rider-packs/types';
import * as ch from '@/lib/rider-packs/channel-list';
import { listMics } from '@/lib/rider-packs/mic-library';
import SubSnakeDialog from './SubSnakeDialog';
import StageBoxDialog from './StageBoxDialog';
import PositionPicker from './PositionPicker';
import { SaveStatePill, type SavePillState } from './SaveStatePill';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { searchGear } from '@/lib/api/gear';
import { PositionSelectCell } from './channel-list-cells/PositionSelectCell';
import { StandSelectCell } from './channel-list-cells/StandSelectCell';
import { CableLengthSelectCell } from './channel-list-cells/CableLengthSelectCell';
import { MicDiSelectCell } from './channel-list-cells/MicDiSelectCell';
import { OutputBlock, OUTPUT_GRID, OUTPUT_COL_COUNT } from './channel-list-cells/OutputBlock';
import { InventoryAggregates } from './channel-list-cells/InventoryAggregates';
import { CellNavProvider, NavCell } from '@/lib/hooks/useCellNav';

/* Sprint 12 §8b2 — colCount across input-grid cells (Name,
   Position, Stage Box, Loom, Cable, Mic-DI, Stand, Phantom,
   Provider, Notes). Channel # is read-only display, not a
   focusable cell. Drag handle + color stripe + actions sit
   outside the nav matrix. */
const INPUT_COL_COUNT = 10;

/* Sprint 12 §8b1 — POSITION_SUGGESTIONS removed: the Pos cell
   is now <PositionSelectCell> with the canonical enum from
   the §8 spec. The old datalist used a different (legacy) set
   of suggestions. */

const ADD_BTN =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors';
const ADD_BTN_STYLE = {
  backgroundColor: 'var(--lp-bg-secondary)',
  border: '1px solid var(--lp-border)',
  color: 'var(--lp-text)',
} as const;

/* Sprint 12 §8b1 — column order matches the spec: 11 logical
   cells per row + the 3 chrome cells (color stripe / drag handle /
   actions). The mic_substitute column is dropped from the
   editor surface; legacy data stays on the row (the editor
   simply doesn't render it).

   Tracks:
     1   color stripe                 6px
     2   drag handle                  24px
     3   channel # (sticky col 1)     32px
     4   name                         minmax(10rem, 1.4fr)
     5   position (select)            minmax(4rem, 0.55fr)
     6   stage box (PositionPicker)   minmax(4.5rem, 0.7fr)
     7   loom / sub-snake             minmax(4.5rem, 0.7fr)
     8   cable length (select)        minmax(4rem, 0.55fr)
     9   mic / di (select)            minmax(6rem, 1fr)
     10  stand (select)               minmax(4rem, 0.6fr)
     11  phantom (3-state button)     2.25rem
     12  provider (select)            minmax(4.5rem, 0.55fr)
     13  notes                        minmax(7rem, 1.1fr)
     14  row actions                  4.5rem
   ============================================ */
const CHANNEL_ROW_GRID: CSSProperties = {
  gridTemplateColumns:
    '6px 24px 32px minmax(10rem,1.4fr) minmax(4rem,0.55fr) minmax(4.5rem,0.7fr) minmax(4.5rem,0.7fr) minmax(4rem,0.55fr) minmax(6rem,1fr) minmax(4rem,0.6fr) 2.25rem minmax(4.5rem,0.55fr) minmax(7rem,1.1fr) 4.5rem',
};

function countWirelessHint(rows: ChannelListRow[]) {
  return rows.filter((r) =>
    /\bRF\d?\b|wireless|W\/L|IEM|belt-?pack/i.test(
      [r.channel_name, r.mic, r.position, r.mic_substitute, r.notes, r.stand, r.di].join(' '),
    ),
  ).length;
}

function countDiFilled(rows: ChannelListRow[]) {
  return rows.filter((r) => (r.di ?? '').trim().length > 0).length;
}

type Props = {
  section: ResolvedSection;
  pack: RiderPack;
  savePill: { state: SavePillState; error: string | null };
  onTitleCommit: (title: string) => void;
  onFieldBlur: () => void;
  onRemove: () => void;
  onOverride: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onStructureChange: () => void | Promise<void>;
};

function cyclePhantom(p: boolean | null): boolean | null {
  if (p === null) return true;
  if (p === true) return false;
  return null;
}

export default function ChannelListEditor({
  section,
  pack,
  savePill,
  onTitleCommit,
  onFieldBlur,
  onRemove,
  onOverride,
  onMoveUp,
  onMoveDown,
  onStructureChange,
}: Props) {
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [rows, setRows] = useState<ChannelListRow[]>(section.rows ?? []);
  const subSnakes = section.subSnakes ?? [];
  const stageBoxes = section.stageBoxes ?? [];
  const [subDialog, setSubDialog] = useState(false);
  const [stageDialog, setStageDialog] = useState(false);
  const [mics, setMics] = useState<MicLibraryEntry[]>([]);
  const [gearByName, setGearByName] = useState<
    Map<string, { id: string; ownership: 'owned' | 'sub_hired' | 'hired_to_client' }>
  >(new Map());
  const inherited = !!section.inherited_from;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTitleDraft(section.title);
  }, [section.title]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(section.rows ?? []);
  }, [section.id, section.rows]);

  useEffect(() => {
    const supabase = createClient();
    void listMics(supabase, pack.workspace_id).then(setMics).catch(() => setMics([]));
  }, [pack.workspace_id]);

  useEffect(() => {
    let cancelled = false;
    void searchGear('', { limit: 400 })
      .then((rows) => {
        if (cancelled) return;
        const next = new Map<string, { id: string; ownership: 'owned' | 'sub_hired' | 'hired_to_client' }>();
        for (const row of rows) {
          next.set((row.name ?? '').trim().toLowerCase(), {
            id: row.id,
            ownership: row.ownership,
          });
        }
        setGearByName(next);
      })
      .catch(() => {
        if (!cancelled) setGearByName(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(rows, oldIndex, newIndex);
    setRows(next);
    const ids = next.map((r) => r.id);
    const prev = rows;
    try {
      await ch.reorderRows(createClient(), section.id, ids);
      await onStructureChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reorder failed');
      setRows(prev);
    }
  };

  /* §CL1.1 — `newlyAddedRowId` lets the row that's just been
     added auto-focus its Name input on next render. Cleared
     once the row mounts + focuses (or after a short timeout
     defence). */
  const [newlyAddedRowId, setNewlyAddedRowId] = useState<string | null>(null);

  const addChannel = async () => {
    try {
      const r = await ch.appendRow(createClient(), {
        packId: pack.id,
        sectionId: section.id,
      });
      setRows((prev) => [...prev, r].sort((a, b) => a.row_index - b.row_index));
      setNewlyAddedRowId(r.id);
      await onStructureChange();
    } catch (err) {
      /* §CL1.1 — pre-fix the click silently swallowed the
         promise rejection (`void addChannel()` discards). The
         alert mirrors handleDragEnd's pattern so the user
         sees the actual server error. */
      alert(err instanceof Error ? err.message : 'Add channel failed');
    }
  };

  /* Sprint 12 §8b2 — add an OUTPUT row. Drives the output
     sub-grid below the input table. */
  const addOutput = async () => {
    try {
      const r = await ch.appendOutputRow(createClient(), {
        packId: pack.id,
        sectionId: section.id,
      });
      setRows((prev) => [...prev, r].sort((a, b) => a.row_index - b.row_index));
      setNewlyAddedRowId(r.id);
      await onStructureChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Add output failed');
    }
  };

  /* Sprint 12 §8b2 — split rows by row_kind. Input rows drive
     the main channel grid; output rows render in a stacked
     sub-grid below. Both share the underlying row_index
     sequence (UNIQUE constraint on section_id, row_index). */
  const inputRows = useMemo(
    () => rows.filter((r) => (r.row_kind ?? 'input') === 'input'),
    [rows],
  );
  const outputRows = useMemo(
    () => rows.filter((r) => r.row_kind === 'output'),
    [rows],
  );

  const setOutputLocal = useCallback(
    (r: ChannelListRow) =>
      setRows((prev) => prev.map((x) => (x.id === r.id ? r : x))),
    [],
  );

  return (
    <div
      className="w-full max-w-full min-w-0 rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
        style={{ borderColor: 'var(--lp-border)' }}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              if (titleDraft !== section.title && !inherited) onTitleCommit(titleDraft);
              onFieldBlur();
            }}
            disabled={inherited}
            className="min-w-0 max-w-md flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-lp-text outline-none focus:border-lp-border disabled:text-lp-text-tertiary"
            placeholder="Section title"
          />
          {savePill.state !== 'idle' && <SaveStatePill state={savePill.state} error={savePill.error} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubDialog(true)}
            className="text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:text-lp-orange"
          >
            Manage sub-snakes
          </button>
          <button
            type="button"
            onClick={() => setStageDialog(true)}
            className="text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:text-lp-orange"
          >
            Manage stage I/O
          </button>
          <div className="flex shrink-0 items-center gap-1 text-xs">
            <button
              type="button"
              onClick={onMoveUp}
              className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              className="rounded border border-lp-border px-2 py-1 hover:bg-lp-surface-hover"
            >
              ↓
            </button>
            {inherited ? (
              <button
                type="button"
                onClick={onOverride}
                className="rounded bg-lp-orange px-2 py-1 text-white hover:bg-lp-orange/90"
              >
                Override
              </button>
            ) : (
              <button
                type="button"
                onClick={onRemove}
                className="rounded border border-lp-border px-2 py-1 text-lp-error hover:opacity-90"
                style={{ backgroundColor: 'rgba(239,68,68,0.1)' }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
      {inherited && (
        <div className="border-b px-4 py-2 text-xs text-lp-text-secondary" style={{ borderColor: 'var(--lp-border)' }}>
          Inherited from {section.inherited_from}. Override to edit here.
        </div>
      )}

      <div className={inherited ? 'pointer-events-none opacity-60' : ''}>
        <div className="grid grid-cols-2 gap-2 border-b border-lp-border px-3 py-3 sm:grid-cols-4" style={{ borderColor: 'var(--lp-border)' }}>
          {[
            { k: 'channels', label: 'Channels', value: String(rows.length) },
            { k: 'wireless', label: 'Wireless / RF (hint)', value: String(countWirelessHint(rows)) },
            { k: 'boxes', label: 'Sub-snakes (boxes)', value: String(subSnakes.length) },
            { k: 'di', label: 'DI / cable (filled)', value: String(countDiFilled(rows)) },
          ].map((c) => (
            <div
              key={c.k}
              className="rounded-lg px-3 py-2"
              style={{ backgroundColor: 'var(--lp-bg)', border: '1px solid var(--lp-border)' }}
            >
              <div className="text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">
                {c.label}
              </div>
              <div className="text-xl font-semibold tabular-nums text-lp-text">{c.value}</div>
            </div>
          ))}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          <div className="w-full min-w-0 max-h-[min(75vh,720px)] overflow-y-auto overflow-x-auto overscroll-contain">
            <div className="w-full min-w-0" style={{ minWidth: 'min(100%, 1180px)' }}>
              {/* Sprint 12 §8b1 — header columns match the new
                  spec order. Track 3 (channel #) is sticky-left
                  per row; the header cell gets the same z-index
                  treatment so it stays put on horizontal scroll. */}
              <div
                className="sticky top-0 z-20 grid w-full min-h-9 items-stretch gap-0 border-b border-lp-border bg-lp-surface text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary shadow-[0_1px_0_var(--lp-border)]"
                style={CHANNEL_ROW_GRID}
              >
                <div className="py-2" style={{ borderLeft: '2px solid transparent' }} />
                <div className="py-2" />
                <div
                  className="py-2 pl-0.5"
                  style={{
                    position: 'sticky',
                    left: 0,
                    background: 'var(--lp-surface)',
                    zIndex: 21,
                  }}
                >
                  #
                </div>
                <div className="px-0.5 py-2 pl-1">Name</div>
                <div className="px-0.5 py-2">Pos</div>
                <div className="px-0.5 py-2">Stage Box</div>
                <div className="px-0.5 py-2">Loom</div>
                <div className="px-0.5 py-2">Cable</div>
                <div className="px-0.5 py-2">Mic / DI</div>
                <div className="px-0.5 py-2">Stand</div>
                <div className="px-0.5 py-2 text-center">+48</div>
                <div className="px-0.5 py-2">Prov</div>
                <div className="px-0.5 py-2 min-w-0">Notes</div>
                <div className="px-0.5 py-2 text-right" />
              </div>
              <CellNavProvider colCount={INPUT_COL_COUNT}>
                <SortableContext items={inputRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {inputRows.map((row, idx) => (
                    <ChannelBlock
                      key={row.id}
                      row={row}
                      rows={inputRows}
                      inputRowIdx={idx}
                      subSnakes={subSnakes}
                      stageBoxes={stageBoxes}
                      mics={mics}
                      gearByName={gearByName}
                      gridStyle={CHANNEL_ROW_GRID}
                      onUpdateLocal={(r) => setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)))}
                      onRefresh={onStructureChange}
                      onOpenSubDialog={() => setSubDialog(true)}
                      onOpenStageDialog={() => setStageDialog(true)}
                      sectionId={section.id}
                      packId={pack.id}
                      autoFocusName={row.id === newlyAddedRowId}
                      onAutoFocused={() => setNewlyAddedRowId(null)}
                    />
                  ))}
                </SortableContext>
              </CellNavProvider>
            </div>
          </div>
        </DndContext>

        <div className="border-t border-lp-border bg-lp-surface px-3 py-3">
          <button
            type="button"
            onClick={() => void addChannel()}
            className={ADD_BTN}
            style={ADD_BTN_STYLE}
          >
            + Add channel
          </button>
        </div>

        {/* Sprint 12 §8b2 — output sub-grid. Renders below the
            input grid with its own header + nav island. Empty
            state shows when no row_kind='output' rows exist
            yet. */}
        <div
          className="border-t px-3 py-3"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
          }}
        >
          <div
            className="mb-2 flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)' }}
          >
            <h4
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              Outputs ({outputRows.length})
            </h4>
            <button
              type="button"
              onClick={() => void addOutput()}
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--lp-text-secondary)' }}
            >
              + Add output
            </button>
          </div>

          {outputRows.length === 0 ? (
            <div
              style={{
                padding: 'var(--lp-space-3)',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
                fontStyle: 'italic',
                textAlign: 'center',
                border: '1px dashed var(--lp-border)',
                borderRadius: 'var(--lp-radius-md)',
                background: 'var(--lp-surface)',
              }}
            >
              No outputs yet — add IEM mixes, drive lines, etc.
            </div>
          ) : (
            <div
              className="rounded-md border"
              style={{
                borderColor: 'var(--lp-border)',
                background: 'var(--lp-surface)',
              }}
            >
              <div
                className="grid w-full min-h-9 items-stretch gap-0 border-b text-[10px] font-bold uppercase tracking-wider"
                style={{
                  ...OUTPUT_GRID,
                  borderColor: 'var(--lp-border)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                <div className="py-2 pl-2">#</div>
                <div className="px-1 py-2">Item</div>
                <div className="px-1 py-2">Destination</div>
                <div className="px-1 py-2">Pos</div>
                <div className="px-1 py-2 text-center">QTY</div>
                <div className="px-1 py-2">Notes</div>
                <div className="px-1 py-2 text-right" />
              </div>
              <CellNavProvider colCount={OUTPUT_COL_COUNT}>
                {outputRows.map((row, idx) => (
                  <OutputBlock
                    key={row.id}
                    row={row}
                    outputRowIdx={idx}
                    onUpdateLocal={setOutputLocal}
                    onRefresh={onStructureChange}
                  />
                ))}
              </CellNavProvider>
            </div>
          )}
        </div>

        {/* Sprint 12 §8b3 — 5 inventory aggregate render
            tables. Recompute from rows / stageBoxes / subSnakes
            as the operator edits. Render-only; no schema
            additions. Editable per-row notes on the Mics/DIs
            aggregate is deferred (rider_sections.fields can't
            hold non-Field metadata cleanly; flagged for §9 or
            a dedicated schema commit). */}
        <InventoryAggregates
          rows={rows}
          stageBoxes={stageBoxes}
          subSnakes={subSnakes}
        />
      </div>

      <SubSnakeDialog
        open={subDialog}
        onClose={() => {
          setSubDialog(false);
          void onStructureChange();
        }}
        packId={pack.id}
        sectionId={section.id}
        onChanged={onStructureChange}
      />
      <StageBoxDialog
        open={stageDialog}
        onClose={() => {
          setStageDialog(false);
          void onStructureChange();
        }}
        packId={pack.id}
        sectionId={section.id}
        onChanged={onStructureChange}
      />
    </div>
  );
}

function ChannelBlock({
  row,
  rows,
  inputRowIdx,
  subSnakes,
  stageBoxes,
  mics,
  gearByName,
  gridStyle,
  onUpdateLocal,
  onRefresh,
  onOpenSubDialog,
  onOpenStageDialog,
  sectionId,
  packId,
  autoFocusName,
  onAutoFocused,
}: {
  row: ChannelListRow;
  rows: ChannelListRow[];
  /* Sprint 12 §8b2 — index within the inputRows array (NOT
     row.row_index, which is the section-wide sequence shared
     with output rows). Drives the CellNav coordinate. */
  inputRowIdx: number;
  subSnakes: SubSnake[];
  stageBoxes: StageBox[];
  mics: MicLibraryEntry[];
  gearByName: Map<string, { id: string; ownership: 'owned' | 'sub_hired' | 'hired_to_client' }>;
  gridStyle: CSSProperties;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
  onOpenSubDialog: () => void;
  onOpenStageDialog: () => void;
  sectionId: string;
  packId: string;
  /* §CL1.1 — set by the parent when this row was just created
     via "+ Add channel". On mount the Name input focuses + the
     parent's onAutoFocused fires to clear the trigger. */
  autoFocusName?: boolean;
  onAutoFocused?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1 };
  const sub = subSnakes.find((s) => s.id === row.sub_snake_id);
  const stripe = sub?.colour;

  const usedSubSnakePositions = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const r of rows) {
      if (r.id === row.id) continue;
      if (r.sub_snake_id && r.sub_snake_position != null) {
        (map[r.sub_snake_id] ??= new Set()).add(r.sub_snake_position);
      }
    }
    return map;
  }, [rows, row.id]);

  const usedStageBoxPositions = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const r of rows) {
      if (r.id === row.id) continue;
      if (r.stage_box_id && r.stage_box_position != null) {
        (map[r.stage_box_id] ??= new Set()).add(r.stage_box_position);
      }
    }
    return map;
  }, [rows, row.id]);

  const getSubOccupant = useCallback(
    (eid: string, pos: number) => {
      const r = rows.find(
        (x) => x.id !== row.id && x.sub_snake_id === eid && x.sub_snake_position === pos,
      );
      if (!r) return null;
      return { rowIndex: r.row_index, name: (r.channel_name || '').trim() || '—' };
    },
    [rows, row.id],
  );

  const getStageOccupant = useCallback(
    (eid: string, pos: number) => {
      const r = rows.find(
        (x) => x.id !== row.id && x.stage_box_id === eid && x.stage_box_position === pos,
      );
      if (!r) return null;
      return { rowIndex: r.row_index, name: (r.channel_name || '').trim() || '—' };
    },
    [rows, row.id],
  );

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

  /* Sprint 12 §8b1 — phantom flash state. When a mic with
     default_phantom=true is picked, we briefly highlight the
     Phantom cell so the auto-fill is visible. The flash lasts
     ~700ms (one animation cycle) and clears via setTimeout. */
  const [phantomFlash, setPhantomFlash] = useState(false);
  const phantomFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Sprint 12 §8b2 — pre-edit value refs for the Esc-revert
     behaviour. On focus we snapshot the current value; on
     Escape (handled in <NavCell>) we restore the snapshot. */
  const nameSnapRef = useRef<string>(local.channel_name);
  const notesSnapRef = useRef<string>(local.notes);

  /* §CL1.1 — focus the Name input on mount when the parent
     flagged this row as freshly added via "+ Add channel".
     Fires onAutoFocused so the parent clears the trigger
     (otherwise a subsequent re-render would re-focus). */
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (!autoFocusName) return;
    nameInputRef.current?.focus();
    onAutoFocused?.();
    // Only fire once on mount with the trigger set; deliberate
    // single-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    return () => {
      if (phantomFlashTimerRef.current) {
        clearTimeout(phantomFlashTimerRef.current);
      }
    };
  }, []);

  const pickMicFromLibrary = (entry: MicLibraryEntry | null, rawName: string) => {
    const patch: Partial<ChannelListRow> = { mic: rawName };
    const mapped = gearByName.get(rawName.trim().toLowerCase()) ?? null;
    patch.gear_id = mapped?.id ?? null;
    if (entry && entry.default_phantom && local.phantom_power !== true) {
      patch.phantom_power = true;
      if (phantomFlashTimerRef.current) {
        clearTimeout(phantomFlashTimerRef.current);
      }
      setPhantomFlash(true);
      phantomFlashTimerRef.current = setTimeout(() => setPhantomFlash(false), 700);
    }
    queue(patch);
    void saveRow.flush();
  };
  return (
    <div ref={setNodeRef} style={style} className="group w-full border-b border-lp-border-light bg-lp-surface">
      <div
        className="grid w-full min-h-11 min-w-0 items-center gap-0 transition-colors hover:bg-lp-surface-hover"
        style={gridStyle}
      >
        <div
          className="h-full min-h-8 w-1 shrink-0"
          style={{ backgroundColor: stripe ?? 'transparent' }}
          aria-hidden
        />
        <div
          className="flex w-5 shrink-0 cursor-grab items-center justify-center text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </div>
        {/* Channel # — sticky col 1 on horizontal scroll. */}
        <div
          className="font-mono text-[11px] tabular-nums text-lp-text-tertiary"
          style={{
            position: 'sticky',
            left: 0,
            background: 'var(--lp-surface)',
            zIndex: 5,
          }}
        >
          {row.row_index}
        </div>
        {/* Name (col 0) — Enter moves down, Esc reverts to
            pre-focus value via the snap ref. */}
        <NavCell
          row={inputRowIdx}
          col={0}
          onCancelEdit={() => {
            queue({ channel_name: nameSnapRef.current });
          }}
        >
          <div className="min-w-0 px-0.5 pl-1">
            <input
              ref={nameInputRef}
              type="text"
              value={local.channel_name}
              onFocus={() => {
                nameSnapRef.current = local.channel_name;
              }}
              onChange={(e) => queue({ channel_name: e.target.value })}
              onBlur={() => {
                void saveRow.flush();
              }}
              className="min-w-0 w-full border-0 bg-transparent py-2 text-sm font-semibold text-lp-text outline-none focus:ring-0"
              placeholder="Channel"
              title={local.channel_name}
            />
          </div>
        </NavCell>
        {/* Position (col 1) — enum select. Esc closes the
            dropdown natively; no cancel-revert needed. */}
        <NavCell row={inputRowIdx} col={1}>
          <div className="min-w-0 self-center px-0.5">
            <PositionSelectCell
              value={local.position}
              onChange={(v) => {
                queue({ position: v });
                void saveRow.flush();
              }}
              ariaLabel={`Stage position for channel ${row.row_index}`}
            />
          </div>
        </NavCell>
        {/* Stage Box (col 2) — PositionPicker (slot-aware). */}
        <NavCell row={inputRowIdx} col={2}>
          <div className="min-w-0 self-center px-0.5">
            <PositionPicker
              entityId={local.stage_box_id}
              position={local.stage_box_position}
              entities={stageBoxes.map((s) => ({
                id: s.id,
                label: s.label,
                colour: s.colour,
                capacity: s.capacity ?? 16,
              }))}
              usedPositions={usedStageBoxPositions}
              onChange={(id, pos) => queue({ stage_box_id: id, stage_box_position: pos })}
              onManageClick={onOpenStageDialog}
              ariaLabel={`Stage box I/O for channel ${row.row_index}`}
              manageLabel="Manage stage I/O"
              getOccupant={getStageOccupant}
              formatLabel={(l, p) => `${l}-${p}`}
            />
          </div>
        </NavCell>
        {/* Loom / sub-snake (col 3) — PositionPicker. */}
        <NavCell row={inputRowIdx} col={3}>
          <div className="min-w-0 self-center px-0.5">
            <PositionPicker
              entityId={local.sub_snake_id}
              position={local.sub_snake_position}
              entities={subSnakes.map((s) => ({
                id: s.id,
                label: s.label,
                colour: s.colour,
                capacity: s.capacity ?? 8,
              }))}
              usedPositions={usedSubSnakePositions}
              onChange={(id, pos) => queue({ sub_snake_id: id, sub_snake_position: pos })}
              onManageClick={onOpenSubDialog}
              ariaLabel={`Sub-snake (loom) for channel ${row.row_index}`}
              manageLabel="Manage sub-snakes"
              getOccupant={getSubOccupant}
              formatLabel={(l, p) => `${l}-${p}`}
            />
          </div>
        </NavCell>
        {/* Cable length (col 4) — enum select. */}
        <NavCell row={inputRowIdx} col={4}>
          <div className="min-w-0 self-center px-0.5">
            <CableLengthSelectCell
              value={local.cable_length}
              onChange={(v) => {
                queue({ cable_length: v });
                void saveRow.flush();
              }}
              ariaLabel={`Cable length for channel ${row.row_index}`}
            />
          </div>
        </NavCell>
        {/* Mic / DI (col 5) — combined mic_library picker. */}
        <NavCell row={inputRowIdx} col={5}>
          <div className="min-w-0 self-center px-0.5">
            <MicDiSelectCell
              value={local.mic}
              mics={mics}
              onPick={pickMicFromLibrary}
              ariaLabel={`Mic or DI for channel ${row.row_index}`}
            />
            {local.gear_id ? (
              <div className="mt-1 inline-flex items-center rounded border border-lp-border bg-lp-bg px-1.5 py-0.5 text-[10px] text-lp-text-secondary">
                <span
                  className={
                    (() => {
                      const ownership =
                        gearByName.get(local.mic.trim().toLowerCase())?.ownership ?? 'owned';
                      if (ownership === 'hired_to_client') return 'text-lp-orange';
                      if (ownership === 'sub_hired') return 'text-blue-400';
                      return 'text-emerald-500';
                    })()
                  }
                >
                  Gear linked
                </span>
              </div>
            ) : null}
          </div>
        </NavCell>
        {/* Stand (col 6) — enum select. */}
        <NavCell row={inputRowIdx} col={6}>
          <div className="min-w-0 self-center px-0.5">
            <StandSelectCell
              value={local.stand}
              onChange={(v) => {
                queue({ stand: v });
                void saveRow.flush();
              }}
              ariaLabel={`Stand type for channel ${row.row_index}`}
            />
          </div>
        </NavCell>
        {/* Phantom (col 7) — 3-state cycle button. Flashes
            on default_phantom auto-fill. */}
        <NavCell row={inputRowIdx} col={7}>
          <div className="flex items-center justify-center self-center">
            <button
              type="button"
              title="Phantom +48V (tap: on · off · n/a)"
              onClick={() => {
                const next = cyclePhantom(local.phantom_power);
                queue({ phantom_power: next });
                void saveRow.flush();
              }}
              className="flex h-7 w-7 items-center justify-center rounded border bg-lp-bg text-lp-text hover:bg-lp-surface-hover"
              style={{
                borderColor: phantomFlash
                  ? 'var(--color-lp-orange)'
                  : 'var(--lp-border)',
                boxShadow: phantomFlash
                  ? '0 0 0 3px color-mix(in srgb, var(--color-lp-orange) 25%, transparent)'
                  : 'none',
                transition: 'border-color 200ms ease-out, box-shadow 200ms ease-out',
              }}
            >
              {local.phantom_power === true && <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />}
              {local.phantom_power === false && <span className="text-lp-text-tertiary">·</span>}
              {local.phantom_power === null && <span className="text-[10px] text-lp-text-tertiary/70">—</span>}
            </button>
          </div>
        </NavCell>
        {/* Provider (col 8) — enum select. */}
        <NavCell row={inputRowIdx} col={8}>
          <div className="min-w-0 self-center px-0.5">
            <BrandedSelect
              value={local.provider ?? ''}
              onChange={(v) => {
                const p = v || '';
                const next: 'band' | 'venue' | 'hire' | null =
                  p === 'band' || p === 'venue' || p === 'hire' ? p : null;
                queue({ provider: next });
                void saveRow.flush();
              }}
              options={[
                { value: '', label: '—' },
                { value: 'band', label: 'Band' },
                { value: 'venue', label: 'Venue' },
                { value: 'hire', label: 'Hire' },
              ]}
              ariaLabel="Provider"
              minWidth={0}
              size="sm"
              className="w-full min-w-0"
              triggerClassName="min-h-8 w-full"
            />
          </div>
        </NavCell>
        {/* Notes (col 9) — text with Enter-down / Esc-revert. */}
        <NavCell
          row={inputRowIdx}
          col={9}
          onCancelEdit={() => {
            queue({ notes: notesSnapRef.current });
          }}
        >
          <div className="min-w-0 self-center px-0.5">
            <input
              type="text"
              value={local.notes}
              onFocus={() => {
                notesSnapRef.current = local.notes;
              }}
              onChange={(e) => queue({ notes: e.target.value })}
              onBlur={() => void saveRow.flush()}
              className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
              placeholder="…"
              title={local.notes}
            />
          </div>
        </NavCell>
        <div className="flex flex-col items-stretch justify-center gap-0.5 self-center pl-0.5 pr-1 text-[10px] sm:flex-row sm:items-center sm:gap-1">
          <button
            type="button"
            className="whitespace-nowrap text-lp-text-secondary hover:text-lp-text"
            onClick={async () => {
              await ch.duplicateRow(createClient(), row.id, sectionId, packId);
              await onRefresh();
            }}
          >
            Copy
          </button>
          <span className="hidden text-lp-text-tertiary/40 sm:inline">|</span>
          <button
            type="button"
            className="whitespace-nowrap text-lp-error hover:opacity-90"
            onClick={async () => {
              if (!confirm('Delete this channel row?')) return;
              await ch.deleteRow(createClient(), row.id);
              await onRefresh();
            }}
          >
            Del
          </button>
        </div>
      </div>
    </div>
  );
}
