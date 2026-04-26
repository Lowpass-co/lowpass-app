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
import type {
  ChannelListRow,
  MicLibraryEntry,
  RiderPack,
  ResolvedSection,
  SectionStageIO,
  SubSnake,
} from '@/lib/rider-packs/types';
import * as ch from '@/lib/rider-packs/channel-list';
import { listMics } from '@/lib/rider-packs/mic-library';
import SubSnakeDialog from './SubSnakeDialog';
import StageIoDialog from './StageIoDialog';
import { SaveStatePill, type SavePillState } from './SaveStatePill';
import { BrandedSelect } from '@/components/ui/BrandedSelect';

const POSITION_SUGGESTIONS = ['USR', 'USL', 'USC', 'DSC', 'DSL', 'DSR', 'OSR', 'OSL', 'DLS', 'FOH'] as const;

const ADD_BTN =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors';
const ADD_BTN_STYLE = {
  backgroundColor: 'var(--lp-bg-secondary)',
  border: '1px solid var(--lp-border)',
  color: 'var(--lp-text)',
} as const;

/** Aligned header + data rows: all channel fields visible (no row “more” menu or expand). */
const CHANNEL_ROW_GRID: CSSProperties = {
  gridTemplateColumns:
    '6px 24px 32px minmax(10rem,1.45fr) minmax(5.5rem,0.72fr) minmax(4.5rem,0.68fr) minmax(2.75rem,0.42fr) minmax(3.5rem,0.5fr) minmax(5.5rem,0.95fr) minmax(3.75rem,0.6fr) minmax(3.5rem,0.55fr) 2.25rem minmax(4.5rem,0.55fr) minmax(7rem,1.1fr) 4.5rem',
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

function hexAlphaBorder(hex: string) {
  if (!hex?.startsWith('#') || hex.length < 7) return '#00000033';
  return `${hex.slice(0, 7)}33`;
}
function hexAlphaBg(hex: string) {
  if (!hex?.startsWith('#') || hex.length < 7) return '#0000001a';
  return `${hex.slice(0, 7)}1a`;
}

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
  const stageIOs = section.stageIOs ?? [];
  const [subDialog, setSubDialog] = useState(false);
  const [stageDialog, setStageDialog] = useState(false);
  const [mics, setMics] = useState<MicLibraryEntry[]>([]);
  const inherited = !!section.inherited_from;

  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  useEffect(() => {
    setRows(section.rows ?? []);
  }, [section.id, section.rows]);

  useEffect(() => {
    const supabase = createClient();
    void listMics(supabase, pack.workspace_id).then(setMics).catch(() => setMics([]));
  }, [pack.workspace_id]);

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

  const addChannel = async () => {
    const r = await ch.appendRow(createClient(), { packId: pack.id, sectionId: section.id });
    setRows((prev) => [...prev, r].sort((a, b) => a.row_index - b.row_index));
    await onStructureChange();
  };

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
          <div className="w-full min-w-0 overflow-x-auto">
            <div className="w-full min-w-0" style={{ minWidth: 'min(100%, 1180px)' }}>
              <div
                className="sticky top-16 z-10 grid w-full min-h-9 items-stretch gap-0 border-b border-lp-border bg-lp-surface text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary shadow-[0_1px_0_var(--lp-border)]"
                style={CHANNEL_ROW_GRID}
              >
                <div className="py-2" style={{ borderLeft: '2px solid transparent' }} />
                <div className="py-2" />
                <div className="py-2 pl-0.5">#</div>
                <div className="px-0.5 py-2 pl-1">Name</div>
                <div className="px-0.5 py-2">Box</div>
                <div className="px-0.5 py-2">I/O</div>
                <div className="px-0.5 py-2">Pos</div>
                <div className="px-0.5 py-2">DI / cable</div>
                <div className="px-0.5 py-2">Mic</div>
                <div className="px-0.5 py-2">Sub</div>
                <div className="px-0.5 py-2">Stand</div>
                <div className="px-0.5 py-2 text-center">+48</div>
                <div className="px-0.5 py-2">Prov</div>
                <div className="px-0.5 py-2 min-w-0">Notes</div>
                <div className="px-0.5 py-2 text-right" />
              </div>
              <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                  <ChannelBlock
                    key={row.id}
                    row={row}
                    subSnakes={subSnakes}
                    stageIOs={stageIOs}
                    mics={mics}
                    gridStyle={CHANNEL_ROW_GRID}
                    onUpdateLocal={(r) => setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)))}
                    onRefresh={onStructureChange}
                    onOpenSubDialog={() => setSubDialog(true)}
                    onOpenStageDialog={() => setStageDialog(true)}
                    sectionId={section.id}
                    packId={pack.id}
                  />
                ))}
              </SortableContext>
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
      <StageIoDialog
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
  subSnakes,
  stageIOs,
  mics,
  gridStyle,
  onUpdateLocal,
  onRefresh,
  onOpenSubDialog,
  onOpenStageDialog,
  sectionId,
  packId,
}: {
  row: ChannelListRow;
  subSnakes: SubSnake[];
  stageIOs: SectionStageIO[];
  mics: MicLibraryEntry[];
  gridStyle: CSSProperties;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
  onOpenSubDialog: () => void;
  onOpenStageDialog: () => void;
  sectionId: string;
  packId: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.85 : 1 };
  const sub = subSnakes.find((s) => s.id === row.sub_snake_id);
  const stripe = sub?.colour;

  const patchRef = useRef<Partial<ChannelListRow>>({});
  const saveRow = useDebouncedSave<number>(
    useCallback(
      async (_tick: number) => {
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

  const pickMic = (name: string) => {
    const entry = mics.find((m) => m.name === name);
    if (!entry) {
      queue({ mic: name });
      return;
    }
    const patch: Partial<ChannelListRow> = { mic: name };
    if (local.phantom_power === null) {
      patch.phantom_power = entry.default_phantom;
    }
    queue(patch);
  };

  const posListId = `pos-hint-${row.id}`;
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
        <div className="font-mono text-[11px] tabular-nums text-lp-text-tertiary">{row.row_index}</div>
        <div className="min-w-0 px-0.5 pl-1">
          <input
            type="text"
            value={local.channel_name}
            onChange={(e) => queue({ channel_name: e.target.value })}
            onBlur={() => {
              void saveRow.flush();
            }}
            className="min-w-0 w-full border-0 bg-transparent py-2 text-sm font-semibold text-lp-text outline-none focus:ring-0"
            placeholder="Channel"
            title={local.channel_name}
          />
        </div>
        <div className="min-w-0 self-center px-0.5">
          <SubSnakeCombo
            subSnakes={subSnakes}
            selectedId={local.sub_snake_id}
            onSelect={(id) => queue({ sub_snake_id: id })}
            onOpenManage={onOpenSubDialog}
            disabled={false}
          />
        </div>
        <div className="min-w-0 self-center px-0.5">
          <StageIoCombo
            stageIOs={stageIOs}
            selectedId={local.stage_io_id ?? null}
            fallbackText={local.stage_box}
            onSelect={(id, label) => {
              queue({ stage_io_id: id, stage_box: label });
            }}
            onOpenManage={onOpenStageDialog}
          />
        </div>
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.position}
            onChange={(e) => queue({ position: e.target.value })}
            onBlur={() => void saveRow.flush()}
            list={posListId}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="Pos"
          />
          <datalist id={posListId}>
            {POSITION_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.di}
            onChange={(e) => queue({ di: e.target.value })}
            onBlur={() => void saveRow.flush()}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="6′, DI…"
            title="Cable / DI / sub snakes"
          />
        </div>
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.mic}
            onChange={(e) => queue({ mic: e.target.value })}
            onBlur={() => {
              const v = local.mic.trim();
              if (mics.some((m) => m.name === v)) {
                pickMic(v);
                return;
              }
              void saveRow.flush();
            }}
            list={`mic-hint-${row.id}`}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="Mic"
          />
          <datalist id={`mic-hint-${row.id}`}>
            {mics.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </div>
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.mic_substitute}
            onChange={(e) => queue({ mic_substitute: e.target.value })}
            onBlur={() => void saveRow.flush()}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="Sub"
          />
        </div>
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.stand}
            onChange={(e) => queue({ stand: e.target.value })}
            onBlur={() => void saveRow.flush()}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="Stand"
          />
        </div>
        <div className="flex items-center justify-center self-center">
          <button
            type="button"
            title="Phantom +48V (tap: on · off · n/a)"
            onClick={() => {
              const next = cyclePhantom(local.phantom_power);
              queue({ phantom_power: next });
              void saveRow.flush();
            }}
            className="flex h-7 w-7 items-center justify-center rounded border border-lp-border bg-lp-bg text-lp-text hover:bg-lp-surface-hover"
          >
            {local.phantom_power === true && <Check className="h-3.5 w-3.5 text-emerald-500" strokeWidth={2.5} />}
            {local.phantom_power === false && <span className="text-lp-text-tertiary">·</span>}
            {local.phantom_power === null && <span className="text-[10px] text-lp-text-tertiary/70">—</span>}
          </button>
        </div>
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
        <div className="min-w-0 self-center px-0.5">
          <input
            type="text"
            value={local.notes}
            onChange={(e) => queue({ notes: e.target.value })}
            onBlur={() => void saveRow.flush()}
            className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1.5 text-xs text-lp-text outline-none focus:border-lp-orange/40"
            placeholder="…"
            title={local.notes}
          />
        </div>
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

function SubSnakeCombo({
  subSnakes,
  selectedId,
  onSelect,
  onOpenManage,
  disabled,
}: {
  subSnakes: SubSnake[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onOpenManage: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = subSnakes.find((s) => s.id === selectedId);
  const filtered = useMemo(
    () => subSnakes.filter((s) => s.label.toLowerCase().includes(q.trim().toLowerCase())),
    [subSnakes, q],
  );

  return (
    <div className="relative min-w-0">
      <input
        disabled={disabled}
        type="text"
        value={open ? q : (selected ? selected.label : '')}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQ(selected?.label ?? '');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey && open && filtered.length > 0) {
            e.preventDefault();
            onSelect(filtered[0].id);
            setOpen(false);
            setQ('');
          } else if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            onSelect(filtered[0].id);
            setOpen(false);
            setQ('');
          } else if (e.key === 'Escape') {
            setOpen(false);
            setQ(selected?.label ?? '');
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1 text-xs text-lp-text outline-none focus:border-lp-orange/50"
        style={
          selected && !open
            ? {
                color: selected.colour,
                backgroundColor: hexAlphaBg(selected.colour),
                borderColor: hexAlphaBorder(selected.colour),
              }
            : undefined
        }
        placeholder="—"
        aria-label="Sub-snake"
        autoComplete="off"
      />
      {open && (filtered.length > 0 || subSnakes.length === 0) && (
        <ul
          className="absolute left-0 z-30 mt-0.5 max-h-40 min-w-full overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-0.5 shadow-md"
          role="listbox"
        >
          <li>
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs text-lp-text hover:bg-lp-surface-hover"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onSelect(null);
                setOpen(false);
                setQ('');
              }}
            >
              None
            </button>
          </li>
          {(filtered.length > 0 ? filtered : subSnakes).map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-lp-surface-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colour }} />
                {s.label}
              </button>
            </li>
          ))}
          <li className="border-t border-lp-border">
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs text-lp-orange hover:bg-lp-surface-hover"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onOpenManage();
              }}
            >
              Manage sub-snakes…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

function StageIoCombo({
  stageIOs,
  selectedId,
  fallbackText,
  onSelect,
  onOpenManage,
}: {
  stageIOs: SectionStageIO[];
  selectedId: string | null;
  fallbackText: string;
  onSelect: (id: string | null, label: string) => void;
  onOpenManage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const selected = stageIOs.find((s) => s.id === selectedId);
  const showVal = selected ? selected.label : fallbackText;
  const filtered = useMemo(
    () => stageIOs.filter((s) => s.label.toLowerCase().includes(q.trim().toLowerCase())),
    [stageIOs, q],
  );

  return (
    <div className="relative min-w-0">
      <input
        type="text"
        value={open ? q : showVal}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setQ(showVal);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Tab' && !e.shiftKey && open && filtered.length > 0) {
            e.preventDefault();
            const s = filtered[0];
            onSelect(s.id, s.label);
            setOpen(false);
            setQ('');
          } else if (e.key === 'Enter' && open && filtered.length > 0) {
            e.preventDefault();
            const s = filtered[0];
            onSelect(s.id, s.label);
            setOpen(false);
            setQ('');
          } else if (e.key === 'Escape') {
            setOpen(false);
            setQ(showVal);
          }
        }}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 120);
        }}
        className="w-full min-w-0 rounded border border-lp-border bg-lp-bg px-1.5 py-1 text-xs text-lp-text outline-none focus:border-lp-orange/50"
        style={
          selected
            ? {
                color: selected.colour,
                backgroundColor: hexAlphaBg(selected.colour),
                borderColor: hexAlphaBorder(selected.colour),
              }
            : undefined
        }
        placeholder="I/O"
        aria-label="Stage I/O"
        autoComplete="off"
      />
      {open && (
        <ul className="absolute left-0 z-30 mt-0.5 max-h-40 min-w-full overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-0.5 shadow-md">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-lp-surface-hover"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onSelect(s.id, s.label);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.colour }} />
                {s.label}
              </button>
            </li>
          ))}
          <li className="border-t border-lp-border">
            <button
              type="button"
              className="w-full px-2 py-1.5 text-left text-xs text-lp-orange hover:bg-lp-surface-hover"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                onOpenManage();
              }}
            >
              Manage stage I/O…
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

