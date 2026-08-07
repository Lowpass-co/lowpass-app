'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
import { GripVertical, ListPlus, Columns3, X } from 'lucide-react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { useToast } from '@/components/ui/Toast';
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
import { AddManyChannelsModal } from './channel-list-cells/AddManyChannelsModal';
import { ChannelListSectionBand } from './channel-list-cells/ChannelListSectionBand';
import { GearDetailSlideOver } from '@/components/gear/GearDetailSlideOver';
import { PatchMatrix, type SocketPatch } from './PatchMatrix';
import { CellNavProvider, NavCell, useCellNav } from '@/lib/hooks/useCellNav';
import {
  COLUMN_BY_KEY,
  OPTIONAL_COLUMNS,
  enabledOptionalKeys,
  getEnabledColumnKeys,
  type ChannelListColumnKey,
} from '@/lib/channel-list/columns';
import { updateSection } from '@/lib/rider-packs/client';
import { ColumnPickerPopover } from './channel-list-cells/ColumnPickerPopover';

/* §CL-FIX-6 — the input-grid column set is now dynamic. Which
   columns render (and the nav-matrix colCount) is derived per
   section from getEnabledColumnKeys(metadata, rows). See
   src/lib/channel-list/columns.ts for the source of truth. */

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

/* §CL-FIX-6 — CHANNEL_ROW_GRID is now built per render from the
   enabled column set: '6px 24px' (stripe + drag) + each enabled
   column's track (number, name, …enabled optionals) + '4.5rem'
   (row actions). Track sizes live on the column defs in
   src/lib/channel-list/columns.ts. */

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
  /* Gear-chip seam — when provided, the per-row "Gear linked" chip
     becomes a button reporting the linked gear id (e.g. to open a
     gear slide-over). Absent → the chip renders passively as before. */
  onGearChipClick?: (gearId: string) => void;
};

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
  onGearChipClick,
}: Props) {
  const { showToast } = useToast();
  /* Gear-chip default target (2026-08-06) — when the parent supplies no
     onGearChipClick, the chip opens this internal slide-over. Explicit prop
     still wins (see the ChannelBlock wiring below). */
  const [gearDetailId, setGearDetailId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState(section.title);
  const [rows, setRows] = useState<ChannelListRow[]>(section.rows ?? []);
  /* §CL-NORELOAD — structure (sub-snakes / stage boxes / enabled columns) is
     held LOCALLY and reconciled client-side, so a structural edit never needs a
     Next server refetch (router.refresh). That refetch was the source of the
     "typing in the I/O customiser reloads the page" + "add-column reloads"
     bugs: every structural mutation awaited onStructureChange → router.refresh,
     which re-ran the server component, swapped the section prop, and reset
     in-progress drafts. Seeded from props; re-seeded when the section prop
     identity changes (parent refresh / section switch). */
  const [subSnakes, setSubSnakes] = useState<SubSnake[]>(section.subSnakes ?? []);
  const [stageBoxes, setStageBoxes] = useState<StageBox[]>(section.stageBoxes ?? []);
  const [metadata, setMetadata] = useState(section.metadata ?? null);
  const [subDialog, setSubDialog] = useState(false);
  const [stageDialog, setStageDialog] = useState(false);
  const [multiAddOpen, setMultiAddOpen] = useState(false);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  /* VIS-CL-07 / G2-2 — patch mode (the patch matrix). patchFocusBoxId pre-filters
     the matrix to one box (set by a stage box's "Patch" button). */
  const [patchMode, setPatchMode] = useState(false);
  const [patchFocusBoxId, setPatchFocusBoxId] = useState<string | null>(null);
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

  /* §CL-NORELOAD — re-seed local structure whenever the parent passes fresh
     section props (section switch, or a rider-side refresh). On the tour
     surface these props are stable, so this only runs on mount / switch. */
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSubSnakes(section.subSnakes ?? []);
    setStageBoxes(section.stageBoxes ?? []);
    setMetadata(section.metadata ?? null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [section.id, section.subSnakes, section.stageBoxes, section.metadata]);

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
      showToast(err instanceof Error ? err.message : 'Reorder failed', 'error');
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
      showToast(err instanceof Error ? err.message : 'Add channel failed', 'error');
    }
  };

  /* §CL-FIX-4 — bulk-add N input rows in one round-trip. */
  const addManyChannels = async (count: number) => {
    try {
      const created = await ch.appendRows(createClient(), {
        packId: pack.id,
        sectionId: section.id,
        count,
      });
      setRows((prev) => [...prev, ...created].sort((a, b) => a.row_index - b.row_index));
      setMultiAddOpen(false);
      if (created.length > 0) setNewlyAddedRowId(created[0].id);
      await onStructureChange();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Add channels failed', 'error');
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
      showToast(err instanceof Error ? err.message : 'Add output failed', 'error');
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

  /* §CL-NORELOAD — reconcile the grid with the server WITHOUT navigating.
     Reads rows + stage boxes + sub-snakes client-side and swaps local state.
     This replaces router.refresh() for the structural paths (I/O dialogs, the
     stage-box patch modal, sub-snake edits) whose results touch data the grid
     renders but that the mutating child doesn't push back optimistically. */
  const refetchLocal = useCallback(async () => {
    const supabase = createClient();
    const [freshRows, boxes, snakes] = await Promise.all([
      ch.listRows(supabase, section.id),
      ch.listStageBoxes(supabase, section.id),
      ch.listSubSnakes(supabase, section.id),
    ]);
    setRows(freshRows);
    setStageBoxes(boxes);
    setSubSnakes(snakes);
  }, [section.id]);

  /* VIS-CL-07 — patch-mode write. SURGICAL: one updateRow on the patched
     channel writing ONLY the socket-family columns (stage_box_id/position or
     sub_snake_id/position — never row_index, never output_*, never another
     row). Optimistic local update; on failure, toast + refetch to reconcile. */
  const patchChannel = useCallback(
    (channelId: string, patch: SocketPatch) => {
      setRows((prev) => prev.map((x) => (x.id === channelId ? { ...x, ...patch } : x)));
      void ch.updateRow(createClient(), channelId, patch).catch((err) => {
        showToast(err instanceof Error ? err.message : 'Patch failed', 'error');
        void refetchLocal();
      });
    },
    [refetchLocal, showToast],
  );

  /* Structural-change notifier handed to the I/O dialogs + inventory patch.
     Does a local, non-navigating refetch, then still calls the parent hook
     (a no-op on the tour surface; the rider PackEditor keeps its own sync). */
  const notifyStructureChange = useCallback(async () => {
    await refetchLocal();
    await onStructureChange();
  }, [refetchLocal, onStructureChange]);

  /* §CL-FIX-6 — enabled column set for this section. Derived
     from section.metadata.enabled_columns, or lazily from the
     server-loaded rows when absent (existing tours look
     unchanged). Computed from section.rows (the stable
     server snapshot) — NOT the local `rows` state — so columns
     don't flicker as the operator types. */
  const enabledKeys = useMemo(
    () => getEnabledColumnKeys(metadata ?? null, section.rows ?? []),
    [metadata, section.rows],
  );
  const show = useMemo(() => new Set<ChannelListColumnKey>(enabledKeys), [enabledKeys]);
  const channelGridStyle = useMemo<CSSProperties>(
    () => ({
      gridTemplateColumns:
        '6px 24px ' + enabledKeys.map((k) => COLUMN_BY_KEY[k].track).join(' ') + ' 4.5rem',
    }),
    [enabledKeys],
  );
  /* Sequential NavCell col index per enabled FOCUSABLE column
     (Number is display-only, so it's skipped). */
  const navCol = useMemo(() => {
    const m: Partial<Record<ChannelListColumnKey, number>> = {};
    let i = 0;
    for (const k of enabledKeys) {
      if (COLUMN_BY_KEY[k].focusable) {
        m[k] = i;
        i += 1;
      }
    }
    return m;
  }, [enabledKeys]);
  const inputColCount = useMemo(
    () => enabledKeys.filter((k) => COLUMN_BY_KEY[k].focusable).length,
    [enabledKeys],
  );

  /* §CL-FIX-6b — soft-hide toggle. Persists the optional-column
     set to rider_sections.metadata.enabled_columns (the first
     explicit toggle freezes the lazily-derived set), then
     refetches so the grid + contextual buttons re-derive. Row
     data is never deleted — re-enabling a column shows it again. */
  const toggleColumn = useCallback(
    async (key: ChannelListColumnKey, enable: boolean) => {
      const current = new Set(enabledOptionalKeys(enabledKeys));
      if (enable) current.add(key);
      else current.delete(key);
      const next = OPTIONAL_COLUMNS.filter((c) => current.has(c.key)).map((c) => c.key);
      const nextMeta = { ...(metadata ?? {}), enabled_columns: next };
      try {
        await updateSection(pack.id, section.id, { metadata: nextMeta });
        /* §CL-NORELOAD — reflect the new column set locally (instant, no
           refetch). The popover stays open; no page reload. */
        setMetadata(nextMeta);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Could not update columns', 'error');
      }
    },
    [enabledKeys, metadata, pack.id, section.id, showToast],
  );

  return (
    <div
      className="w-full max-w-full min-w-0 rounded-xl border shadow-sm"
      style={{ backgroundColor: 'var(--lp-panel)', borderColor: 'var(--lp-border)' }}
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
          {/* §CL-FIX-6b — contextual: only when the column is on. */}
          {show.has('sub_snake') && (
            <button
              type="button"
              onClick={() => setSubDialog(true)}
              className="text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:text-lp-orange"
            >
              Manage sub-snakes
            </button>
          )}
          {show.has('stage_box') && (
            <button
              type="button"
              onClick={() => setStageDialog(true)}
              className="text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:text-lp-orange"
            >
              Manage stage I/O
            </button>
          )}
          {/* §CL-FIX-6b — add / remove columns picker. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnPickerOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={columnPickerOpen}
              className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-lp-text-secondary hover:text-lp-orange"
            >
              <Columns3 className="h-3.5 w-3.5" aria-hidden />
              Columns
            </button>
            <ColumnPickerPopover
              open={columnPickerOpen}
              enabled={show}
              onToggle={(k, enable) => void toggleColumn(k, enable)}
              onClose={() => setColumnPickerOpen(false)}
            />
          </div>
          {/* VIS-CL-07 / G2-2 — Patch mode toggle. Opens the patch matrix. */}
          <button
            type="button"
            onClick={() => setPatchMode((p) => { if (p) setPatchFocusBoxId(null); return !p; })}
            aria-pressed={patchMode}
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{
              color: patchMode ? 'var(--lp-text-inverse)' : 'var(--lp-text-secondary)',
              background: patchMode ? 'var(--color-lp-orange)' : 'transparent',
            }}
          >
            Patch
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
        // VIS-CL-01 — inheritance banner spells out BOTH paths and the
        // cross-show consequence, so the choice is explicit:
        //  · Override here  → detaches a local copy for THIS show only.
        //  · Edit original  → change the {scope}-level rider (the source),
        //    which reflects across every show still inheriting it.
        <div
          className="border-b px-4 py-2 text-xs"
          style={{ borderColor: 'var(--lp-border)', backgroundColor: '#FF45000d' }}
        >
          <div className="text-lp-text-secondary">
            Inherited from the{' '}
            <span className="font-semibold text-lp-text">{section.inherited_from}</span>-level rider.
          </div>
          <ul className="mt-1 space-y-0.5 text-lp-text-tertiary">
            <li>
              <span className="font-semibold text-lp-text-secondary">Override here</span> — detach a
              local copy and edit it for this show only.
            </li>
            <li>
              <span className="font-semibold text-lp-text-secondary">Edit original</span> — open the{' '}
              {section.inherited_from}-level rider to change the source. That{' '}
              <span className="font-semibold text-lp-orange">reflects across all inheriting shows</span>.
            </li>
          </ul>
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

        {patchMode ? (
          /* G2-2 — the patch MATRIX replaces the input grid (channels down,
             sockets across). The outputs sub-grid below stays rendered +
             untouched (VIS-CL-04). */
          <PatchMatrix
            key={patchFocusBoxId ?? 'all'}
            rows={inputRows}
            stageBoxes={stageBoxes}
            subSnakes={subSnakes}
            focusBoxId={patchFocusBoxId}
            onPatch={patchChannel}
          />
        ) : (
          <>
        <ChannelListSectionBand label="Inputs" count={inputRows.length} />

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
          <div className="w-full min-w-0 max-h-[min(75vh,720px)] overflow-y-auto overflow-x-auto overscroll-contain">
            <div className="w-full min-w-0" style={{ minWidth: 'min(100%, 1180px)' }}>
              {/* Sprint 12 §8b1 — header columns match the new
                  spec order. Track 3 (channel #) is sticky-left
                  per row; the header cell gets the same z-index
                  treatment so it stays put on horizontal scroll. */}
              <div
                className="sticky top-0 z-20 grid w-full min-h-9 items-stretch gap-0 border-b border-lp-border bg-lp-surface text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary shadow-[0_1px_0_var(--lp-border)]"
                style={channelGridStyle}
              >
                <div className="py-2" style={{ borderLeft: '2px solid transparent' }} />
                <div className="py-2" />
                {enabledKeys.map((k) => {
                  if (k === 'number') {
                    return (
                      <div
                        key="number"
                        className="py-2 pl-0.5"
                        style={{ position: 'sticky', left: 0, background: 'var(--lp-surface)', zIndex: 21 }}
                      >
                        #
                      </div>
                    );
                  }
                  const def = COLUMN_BY_KEY[k];
                  const extra =
                    k === 'name'
                      ? ' pl-1'
                      : k === 'phantom_power'
                        ? ' text-center'
                        : k === 'notes'
                          ? ' min-w-0'
                          : '';
                  return (
                    <div key={k} className={`group/col relative px-0.5 py-2${extra}`}>
                      {def.label}
                      {!def.permanent && (
                        <button
                          type="button"
                          aria-label={`Hide ${def.label} column`}
                          title={`Hide ${def.label}`}
                          onClick={() => void toggleColumn(k, false)}
                          className="absolute right-0 top-1 hidden h-4 w-4 items-center justify-center rounded text-lp-text-tertiary hover:text-lp-error group-hover/col:flex"
                          style={{ background: 'var(--lp-surface)' }}
                        >
                          <X className="h-3 w-3" aria-hidden />
                        </button>
                      )}
                    </div>
                  );
                })}
                <div className="px-0.5 py-2 text-right" />
              </div>
              <CellNavProvider colCount={inputColCount}>
                <SortableContext items={inputRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {inputRows.map((row, idx) => {
                  /* VIS-CL-06 — group the input rows by STAGE BOX (Adam's call):
                     render a boundary header whenever the stage_box changes from
                     the previous row, so channel-number gaps read as box edges.
                     The header is decorative (not a SortableContext item), so the
                     sortable id list stays exactly inputRows.map(r => r.id). */
                  const prevBoxId = idx > 0 ? inputRows[idx - 1].stage_box_id : undefined;
                  const showGroupHeader =
                    show.has('stage_box') && stageBoxes.length > 0 && row.stage_box_id !== prevBoxId;
                  const groupBox = stageBoxes.find((s) => s.id === row.stage_box_id);
                  return (
                    <Fragment key={row.id}>
                    {showGroupHeader && (
                      <div className="flex items-center gap-2 border-b border-lp-border bg-lp-bg px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary">
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            backgroundColor: groupBox?.colour ?? 'transparent',
                            filter: groupBox?.colour ? 'saturate(0.55)' : undefined,
                            border: groupBox?.colour ? 'none' : '1px solid var(--lp-border)',
                          }}
                        />
                        {groupBox?.label ?? 'Unassigned'}
                      </div>
                    )}
                    <ChannelBlock
                      row={row}
                      rows={inputRows}
                      inputRowIdx={idx}
                      subSnakes={subSnakes}
                      stageBoxes={stageBoxes}
                      mics={mics}
                      gearByName={gearByName}
                      gridStyle={channelGridStyle}
                      show={show}
                      navCol={navCol}
                      onUpdateLocal={(r) => setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)))}
                      onRefresh={onStructureChange}
                      onOpenSubDialog={() => setSubDialog(true)}
                      onOpenStageDialog={() => setStageDialog(true)}
                      sectionId={section.id}
                      packId={pack.id}
                      workspaceId={pack.workspace_id}
                      onMicCreated={(m) =>
                        setMics((prev) =>
                          prev.some((x) => x.id === m.id)
                            ? prev
                            : [...prev, m].sort((a, b) => a.name.localeCompare(b.name)),
                        )
                      }
                      autoFocusName={row.id === newlyAddedRowId}
                      onAutoFocused={() => setNewlyAddedRowId(null)}
                      onGearChipClick={onGearChipClick ?? setGearDetailId}
                    />
                    </Fragment>
                  );
                  })}
                </SortableContext>
              </CellNavProvider>
            </div>
          </div>
        </DndContext>

        {/* VIS-CL-02 — stage-box legend. Desaturated swatches match the left
            row-stripes; heading reads "Stage box". */}
        {stageBoxes.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-lp-border bg-lp-surface px-3 py-2 text-[10px] text-lp-text-tertiary">
            <span className="font-bold uppercase tracking-wider text-lp-text-secondary">Stage box</span>
            {stageBoxes.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-sm"
                  style={{ backgroundColor: s.colour, filter: 'saturate(0.55)' }}
                />
                {s.label}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-lp-border bg-lp-surface px-3 py-3">
          <button
            type="button"
            onClick={() => void addChannel()}
            className={ADD_BTN}
            style={ADD_BTN_STYLE}
          >
            + Add channel
          </button>
          <button
            type="button"
            onClick={() => setMultiAddOpen(true)}
            className={ADD_BTN}
            style={ADD_BTN_STYLE}
          >
            <ListPlus className="h-4 w-4" aria-hidden />
            Add many…
          </button>
        </div>
          </>
        )}

        {/* Sprint 12 §8b2 — output sub-grid. Renders below the
            input grid with its own header + nav island. Empty
            state shows when no row_kind='output' rows exist
            yet. */}
        <div
          className="border-t"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg)',
          }}
        >
          <ChannelListSectionBand
            label="Outputs"
            count={outputRows.length}
            actions={
              <button
                type="button"
                onClick={() => void addOutput()}
                className="text-xs font-semibold uppercase tracking-wide hover:text-lp-orange"
                style={{ color: 'var(--lp-text-secondary)' }}
              >
                + Add output
              </button>
            }
          />

          <div className="px-3 py-3">
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
                <div className="px-1 py-2">Name</div>
                <div className="px-1 py-2">Description</div>
                <div className="px-1 py-2 text-center">Stereo?</div>
                <div className="px-1 py-2 text-center">Pos</div>
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
        </div>

        {/* Sprint 12 §8b3 — 5 inventory aggregate render
            tables. Recompute from rows / stageBoxes / subSnakes
            as the operator edits. Render-only; no schema
            additions. Editable per-row notes on the Mics/DIs
            aggregate is deferred (rider_sections.fields can't
            hold non-Field metadata cleanly; flagged for §9 or
            a dedicated schema commit). */}
        <div className="border-t" style={{ borderColor: 'var(--lp-border)' }}>
          <ChannelListSectionBand label="Inventory" />
          <InventoryAggregates
            rows={rows}
            stageBoxes={stageBoxes}
            subSnakes={subSnakes}
            onPatchBox={(boxId) => { setPatchFocusBoxId(boxId); setPatchMode(true); }}
          />
        </div>
      </div>

      <SubSnakeDialog
        open={subDialog}
        onClose={() => {
          setSubDialog(false);
          void notifyStructureChange();
        }}
        packId={pack.id}
        sectionId={section.id}
        onChanged={notifyStructureChange}
      />
      <StageBoxDialog
        open={stageDialog}
        onClose={() => {
          setStageDialog(false);
          void notifyStructureChange();
        }}
        packId={pack.id}
        sectionId={section.id}
        onChanged={notifyStructureChange}
      />
      <GearDetailSlideOver gearId={gearDetailId} onClose={() => setGearDetailId(null)} />
      <AddManyChannelsModal
        key={multiAddOpen ? 'multi-open' : 'multi-closed'}
        open={multiAddOpen}
        onClose={() => setMultiAddOpen(false)}
        onConfirm={addManyChannels}
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
  show,
  navCol,
  onUpdateLocal,
  onRefresh,
  onOpenSubDialog,
  onOpenStageDialog,
  sectionId,
  packId,
  workspaceId,
  onMicCreated,
  autoFocusName,
  onAutoFocused,
  onGearChipClick,
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
  /* §CL-FIX-6 — enabled column set + per-column nav index. */
  show: Set<ChannelListColumnKey>;
  navCol: Partial<Record<ChannelListColumnKey, number>>;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
  onOpenSubDialog: () => void;
  onOpenStageDialog: () => void;
  sectionId: string;
  packId: string;
  /* §CL-FIX-2 — workspace for inserting a new mic_library row
     from the Mic/DI combobox, + the parent callback that adds
     the new mic to the shared library list. */
  workspaceId: string;
  onMicCreated: (entry: MicLibraryEntry) => void;
  /* §CL1.1 — set by the parent when this row was just created
     via "+ Add channel". On mount the Name input focuses + the
     parent's onAutoFocused fires to clear the trigger. */
  autoFocusName?: boolean;
  onAutoFocused?: () => void;
  /* Gear-chip seam (see Props on ChannelListEditor). */
  onGearChipClick?: (gearId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1 };
  /* §8b4 keyboard-contract parity — Enter-commit-advance for the
     dropdown cells. Reuses the CellNav plumbing (the same focusCell
     registry the mic cell's NavCell wrapper drives — no parallel
     focus mechanism): after a keyboard Enter commit inside a select,
     focus hops to the NEXT cell in the row, wrapping to the next
     row's first cell at the row end exactly like Tab. */
  const { focusCell } = useCellNav();
  const advanceFrom = (key: ChannelListColumnKey) => {
    const col = navCol[key];
    if (col == null) return;
    focusCell({ row: inputRowIdx, col: col + 1 });
  };
  /* VIS-CL-02 — the left row-stripe reflects the STAGE BOX (Adam's call:
     re-pointed from sub_snake → stage_box, the distinct entity with its own
     column + colour). Desaturated at render via filter: saturate() so the
     stripes read as muted box-bands, matched by the footer legend below. */
  const stageBox = stageBoxes.find((s) => s.id === row.stage_box_id);
  const stripe = stageBox?.colour;

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

  /* Gear chip — rendered INLINE with the Mic/DI input (same row,
     right of the input) instead of the old mt-1 block below it, so
     linked rows no longer grow taller. Ownership colour logic is
     unchanged. `gearId` is hoisted so the narrowed string survives
     into the click closure (TS doesn't carry property narrowing
     across function boundaries). */
  const gearId = local.gear_id;
  const gearOwnershipClass = (() => {
    const ownership = gearByName.get(local.mic.trim().toLowerCase())?.ownership ?? 'owned';
    if (ownership === 'hired_to_client') return 'text-lp-orange';
    if (ownership === 'sub_hired') return 'text-blue-400';
    return 'text-emerald-500';
  })();
  const gearChipClass =
    'inline-flex shrink-0 items-center whitespace-nowrap rounded border border-lp-border bg-lp-bg px-1.5 py-0.5 text-[10px] text-lp-text-secondary';
  return (
    <div ref={setNodeRef} style={style} className="group w-full border-b border-lp-border-light bg-lp-surface">
      <div
        className="grid w-full min-h-11 min-w-0 items-center gap-0 transition-colors hover:bg-lp-surface-hover"
        style={gridStyle}
      >
        <div
          className="h-full min-h-8 w-1 shrink-0"
          style={{ backgroundColor: stripe ?? 'transparent', filter: stripe ? 'saturate(0.55)' : undefined }}
          aria-hidden
        />
        {/* Drag handle — row furniture, not a tab stop. tabIndex={-1}
            AFTER the dnd-kit spreads overrides the tabIndex=0 that
            useSortable's attributes inject; pointer dragging is
            unaffected (listeners are pointer-based). */}
        <div
          className="flex w-5 shrink-0 cursor-grab items-center justify-center text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          tabIndex={-1}
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
          col={navCol.name!}
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
        {/* Position — enum select (optional column). */}
        {show.has('position') && (
          <NavCell row={inputRowIdx} col={navCol.position!}>
            <div className="min-w-0 self-center px-0.5">
              <PositionSelectCell
                value={local.position}
                onChange={(v) => {
                  queue({ position: v });
                  void saveRow.flush();
                }}
                ariaLabel={`Stage position for channel ${row.row_index}`}
                onEnterCommit={() => advanceFrom('position')}
              />
            </div>
          </NavCell>
        )}
        {/* Stage Box — PositionPicker (optional column). */}
        {show.has('stage_box') && (
          <NavCell row={inputRowIdx} col={navCol.stage_box!}>
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
                onEnterCommit={() => advanceFrom('stage_box')}
              />
            </div>
          </NavCell>
        )}
        {/* Loom / sub-snake — PositionPicker (optional column). */}
        {show.has('sub_snake') && (
          <NavCell row={inputRowIdx} col={navCol.sub_snake!}>
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
                onEnterCommit={() => advanceFrom('sub_snake')}
              />
            </div>
          </NavCell>
        )}
        {/* Cable length — enum select (optional column). */}
        {show.has('cable_length') && (
          <NavCell row={inputRowIdx} col={navCol.cable_length!}>
            <div className="min-w-0 self-center px-0.5">
              <CableLengthSelectCell
                value={local.cable_length}
                onChange={(v) => {
                  queue({ cable_length: v });
                  void saveRow.flush();
                }}
                ariaLabel={`Cable length for channel ${row.row_index}`}
                onEnterCommit={() => advanceFrom('cable_length')}
              />
            </div>
          </NavCell>
        )}
        {/* Mic / DI — combined mic_library picker (optional column). */}
        {show.has('mic') && (
          <NavCell row={inputRowIdx} col={navCol.mic!}>
          <div className="flex min-w-0 items-center gap-1 self-center px-0.5">
            <div className="min-w-0 flex-1">
              <MicDiSelectCell
                value={local.mic}
                mics={mics}
                onPick={pickMicFromLibrary}
                ariaLabel={`Mic or DI for channel ${row.row_index}`}
                workspaceId={workspaceId}
                onMicCreated={onMicCreated}
              />
            </div>
            {gearId ? (
              onGearChipClick ? (
                /* Interactive seam: mouse furniture only (tabIndex -1),
                   not part of the cell tab path. */
                <button
                  type="button"
                  tabIndex={-1}
                  title="Open this gear item"
                  onClick={() => onGearChipClick(gearId)}
                  className={`${gearChipClass} hover:border-lp-orange/40`}
                >
                  <span className={gearOwnershipClass}>Gear linked</span>
                </button>
              ) : (
                <div className={gearChipClass}>
                  <span className={gearOwnershipClass}>Gear linked</span>
                </div>
              )
            ) : null}
          </div>
        </NavCell>
        )}
        {/* Stand — enum select (optional column). */}
        {/* VIS-CL-06 — Gain (free text, migration 238). */}
        {show.has('gain') && (
          <NavCell row={inputRowIdx} col={navCol.gain!}>
            <div className="min-w-0 self-center px-0.5">
              <input
                type="text"
                value={local.gain ?? ''}
                onChange={(e) => queue({ gain: e.target.value })}
                onBlur={() => void saveRow.flush()}
                className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
                placeholder="…"
                aria-label={`Gain for channel ${row.row_index}`}
                title={local.gain ?? ''}
              />
            </div>
          </NavCell>
        )}
        {show.has('stand') && (
          <NavCell row={inputRowIdx} col={navCol.stand!}>
            <div className="min-w-0 self-center px-0.5">
              <StandSelectCell
                value={local.stand}
                onChange={(v) => {
                  queue({ stand: v });
                  void saveRow.flush();
                }}
                ariaLabel={`Stand type for channel ${row.row_index}`}
                onEnterCommit={() => advanceFrom('stand')}
              />
            </div>
          </NavCell>
        )}
        {/* Phantom — binary +48V toggle (§CL-FIX-3, optional column). */}
        {show.has('phantom_power') && (
        <NavCell row={inputRowIdx} col={navCol.phantom_power!}>
          <div className="flex items-center justify-center self-center">
            <button
              type="button"
              role="switch"
              aria-checked={local.phantom_power === true}
              aria-label={`Phantom +48V for channel ${row.row_index}`}
              title="Phantom +48V (on / off)"
              onClick={() => {
                queue({ phantom_power: local.phantom_power !== true });
                void saveRow.flush();
              }}
              className="flex h-7 w-7 items-center justify-center rounded border hover:bg-lp-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
              style={{
                // VIS-CL-03 — +48V is a state toggle, not a category, so the dot
                // stays NEUTRAL: filled disc = on, hollow ring = off. No hue. The
                // orange only flashes transiently on the batch-apply pulse.
                background: 'var(--lp-bg)',
                borderColor: phantomFlash
                  ? 'var(--color-lp-orange)'
                  : local.phantom_power === true
                    ? 'var(--lp-text-secondary)'
                    : 'var(--lp-border)',
                boxShadow: phantomFlash
                  ? '0 0 0 3px color-mix(in srgb, var(--color-lp-orange) 25%, transparent)'
                  : 'none',
                transition:
                  'border-color 200ms ease-out, box-shadow 200ms ease-out',
              }}
            >
              {/* Filled neutral disc when on; hollow ring when off. */}
              <span
                aria-hidden
                className="block rounded-full"
                style={{
                  width: '0.6rem',
                  height: '0.6rem',
                  background: local.phantom_power === true ? 'var(--lp-text-secondary)' : 'transparent',
                  border: local.phantom_power === true ? 'none' : '1.5px solid var(--lp-text-tertiary)',
                }}
              />
            </button>
          </div>
        </NavCell>
        )}
        {/* Provider — enum select (optional column). */}
        {show.has('provider') && (
        <NavCell row={inputRowIdx} col={navCol.provider!}>
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
              /* VIS-CL-05 — ownership chips. The leading colour dot (rendered
                 by BrandedSelect in both the trigger and the menu) reads the
                 provider as an ownership category: band = owned (neutral),
                 venue = venue-supplies (info blue), hire = rented (orange). */
              options={[
                { value: '', label: '—' },
                { value: 'band', label: 'Band (owned)', color: 'var(--lp-text-secondary)' },
                { value: 'venue', label: 'Venue supplies', color: 'var(--color-lp-info)' },
                { value: 'hire', label: 'Hire (rented)', color: 'var(--color-lp-orange)' },
              ]}
              ariaLabel="Provider"
              minWidth={0}
              size="sm"
              filterable
              onEnterCommit={() => advanceFrom('provider')}
              className="w-full min-w-0"
              triggerClassName="min-h-8 w-full"
            />
          </div>
        </NavCell>
        )}
        {/* Notes — text with Enter-down / Esc-revert (optional column). */}
        {show.has('notes') && (
        <NavCell
          row={inputRowIdx}
          col={navCol.notes!}
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
        )}
        {/* Row actions — mouse furniture, skipped from the tab order
            (tabIndex={-1}) so Tab walks cells only. */}
        <div className="flex flex-col items-stretch justify-center gap-0.5 self-center pl-0.5 pr-1 text-[10px] sm:flex-row sm:items-center sm:gap-1">
          <button
            type="button"
            tabIndex={-1}
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
            tabIndex={-1}
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
