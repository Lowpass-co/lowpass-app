'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChevronRight, GripVertical, MoreHorizontal } from 'lucide-react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import type { ChannelListRow, MicLibraryEntry, RiderPack, ResolvedSection, SubSnake } from '@/lib/rider-packs/types';
import * as ch from '@/lib/rider-packs/channel-list';
import { listMics } from '@/lib/rider-packs/mic-library';
import SubSnakeDialog from './SubSnakeDialog';
import { SaveStatePill, type SavePillState } from './SaveStatePill';

const POSITION_SUGGESTIONS = ['USR', 'USL', 'USC', 'DSC', 'DSL', 'DSR', 'OSR', 'OSL', 'DLS', 'FOH'] as const;

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
function labelPhantom(p: boolean | null) {
  if (p === true) return '+48V';
  if (p === false) return '—';
  return 'unset';
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
  const [subSnakes, setSubSnakes] = useState<SubSnake[]>(section.subSnakes ?? []);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [subOpenFor, setSubOpenFor] = useState<string | null>(null);
  const [subDialog, setSubDialog] = useState(false);
  const [mics, setMics] = useState<MicLibraryEntry[]>([]);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const inherited = !!section.inherited_from;

  useEffect(() => {
    setTitleDraft(section.title);
  }, [section.title]);

  useEffect(() => {
    setRows(section.rows ?? []);
    setSubSnakes(section.subSnakes ?? []);
  }, [section.id, section.rows, section.subSnakes]);

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
    const supabase = createClient();
    const ids = next.map((r) => r.id);
    const prev = rows;
    try {
      await ch.reorderRows(supabase, section.id, ids);
      await onStructureChange();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Reorder failed');
      setRows(prev);
    }
  };

  const addChannel = async () => {
    const supabase = createClient();
    const r = await ch.appendRow(supabase, { packId: pack.id, sectionId: section.id });
    setRows((prev) => [...prev, r].sort((a, b) => a.row_index - b.row_index));
    await onStructureChange();
  };

  return (
    <div
      className="mx-auto max-w-5xl overflow-hidden rounded-xl border"
      style={{ backgroundColor: 'var(--lp-surface)', borderColor: 'var(--lp-border)' }}
    >
      <div
        className="flex items-center justify-between gap-2 border-b px-4 py-3"
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
      {inherited && (
        <div className="border-b px-4 py-2 text-xs text-lp-text-secondary" style={{ borderColor: 'var(--lp-border)' }}>
          Inherited from {section.inherited_from}. Override to edit here.
        </div>
      )}

      <div className={inherited ? 'pointer-events-none opacity-60' : ''}>
        <div className="overflow-x-auto">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void handleDragEnd(e)}>
            <div
              className="sticky top-0 z-10 flex min-w-[800px] border-b border-lp-border bg-lp-surface text-xs font-medium text-lp-text-tertiary"
            >
              <div className="w-6 shrink-0" />
              <div className="w-8 shrink-0 py-2 pl-1">#</div>
              <div className="min-w-[120px] flex-1 py-2 pl-1">Channel</div>
              <div className="w-[100px] shrink-0 py-2">Sub-snake</div>
              <div className="w-20 shrink-0 py-2">Stage</div>
              <div className="w-24 shrink-0 py-2">Pos</div>
              <div className="min-w-[100px] w-28 shrink-0 py-2">Mic</div>
              <div className="w-8 shrink-0 py-2" />
            </div>
            <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
              {rows.map((row) => (
                <ChannelBlock
                  key={row.id}
                  row={row}
                  subSnakes={subSnakes}
                  mics={mics}
                  expanded={expanded.has(row.id)}
                  onToggleExpand={() =>
                    setExpanded((prev) => {
                      const n = new Set(prev);
                      if (n.has(row.id)) n.delete(row.id);
                      else n.add(row.id);
                      return n;
                    })
                  }
                  subOpen={subOpenFor === row.id}
                  onSubOpenToggle={() => setSubOpenFor((id) => (id === row.id ? null : row.id))}
                  rowMenu={rowMenu === row.id}
                  onRowMenuToggle={() => setRowMenu((id) => (id === row.id ? null : row.id))}
                  onUpdateLocal={(r) => setRows((prev) => prev.map((x) => (x.id === r.id ? r : x)))}
                  onRefresh={onStructureChange}
                  onOpenSubDialog={() => setSubDialog(true)}
                  sectionId={section.id}
                  packId={pack.id}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-lp-border bg-lp-surface px-3 py-2">
          <button type="button" onClick={() => void addChannel()} className="text-sm text-lp-orange hover:underline">
            + Add channel
          </button>
          <button
            type="button"
            onClick={() => setSubDialog(true)}
            className="text-sm text-lp-text-secondary hover:text-lp-text"
          >
            Manage sub-snakes
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
    </div>
  );
}

function ChannelBlock({
  row,
  subSnakes,
  mics,
  expanded,
  onToggleExpand,
  subOpen,
  onSubOpenToggle,
  rowMenu,
  onRowMenuToggle,
  onUpdateLocal,
  onRefresh,
  onOpenSubDialog,
  sectionId,
  packId,
}: {
  row: ChannelListRow;
  subSnakes: SubSnake[];
  mics: MicLibraryEntry[];
  expanded: boolean;
  onToggleExpand: () => void;
  subOpen: boolean;
  onSubOpenToggle: () => void;
  rowMenu: boolean;
  onRowMenuToggle: () => void;
  onUpdateLocal: (r: ChannelListRow) => void;
  onRefresh: () => void | Promise<void>;
  onOpenSubDialog: () => void;
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
        const supabase = createClient();
        await ch.updateRow(supabase, row.id, p);
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
    <div
      ref={setNodeRef}
      style={style}
      className="group min-w-[800px] border-b border-lp-border-light bg-lp-surface"
    >
      <div
        className="flex min-h-11 min-w-0 items-stretch transition-colors hover:bg-lp-surface-hover"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.target === e.currentTarget) onToggleExpand();
        }}
        role="row"
        tabIndex={0}
      >
        <div
          className="w-1 shrink-0 self-stretch"
          style={{ backgroundColor: stripe ?? 'transparent' }}
          aria-hidden
        />
        <div
          className="flex w-5 shrink-0 items-center justify-center pl-0.5 text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" aria-hidden />
        </div>
        <div className="flex w-7 shrink-0 items-center pr-0.5 font-mono text-xs tabular-nums text-lp-text-tertiary">
          {row.row_index}
        </div>
        <div className="flex min-w-[120px] flex-1 items-center gap-0.5 px-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="shrink-0 rounded p-0.5 text-lp-text-tertiary hover:text-lp-text"
            aria-expanded={expanded}
          >
            <ChevronRight
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
          <input
            type="text"
            value={local.channel_name}
            onChange={(e) => queue({ channel_name: e.target.value })}
            onBlur={() => {
              void saveRow.flush();
            }}
            className="min-w-0 flex-1 border-0 bg-transparent py-1.5 text-sm text-lp-text outline-none focus:ring-0"
            placeholder="Channel name"
          />
        </div>
        <div className="relative w-[100px] shrink-0 self-center px-0.5">
          <button
            type="button"
            onClick={onSubOpenToggle}
            className="flex w-full min-w-0 items-center justify-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium"
            style={
              sub
                ? {
                    color: sub.colour,
                    backgroundColor: hexAlphaBg(sub.colour),
                    border: `1px solid ${hexAlphaBorder(sub.colour)}`,
                  }
                : { color: 'var(--lp-text-secondary)', border: '1px solid var(--lp-border)' }
            }
          >
            <span className="truncate">{sub?.label ?? '—'}</span>
          </button>
          {subOpen && (
            <div
              className="absolute left-0 z-20 mt-1 max-h-48 min-w-[160px] overflow-y-auto rounded-md border border-lp-border bg-lp-surface py-1 shadow-md"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-lp-text hover:bg-lp-surface-hover"
                onClick={() => {
                  queue({ sub_snake_id: null });
                  onSubOpenToggle();
                }}
              >
                None
              </button>
              {subSnakes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs hover:bg-lp-surface-hover"
                  onClick={() => {
                    queue({ sub_snake_id: s.id });
                    onSubOpenToggle();
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: s.colour }}
                  />
                  {s.label}
                </button>
              ))}
              <button
                type="button"
                className="w-full border-t border-lp-border-light px-2 py-1.5 text-left text-xs text-lp-orange hover:bg-lp-surface-hover"
                onClick={() => {
                  onSubOpenToggle();
                  onOpenSubDialog();
                }}
              >
                Manage…
              </button>
            </div>
          )}
        </div>
        <div className="w-20 shrink-0 self-center px-0.5">
          <input
            type="text"
            value={local.stage_box}
            onChange={(e) => queue({ stage_box: e.target.value })}
            onBlur={() => void saveRow.flush()}
            className="w-full border-0 border-b border-transparent bg-transparent py-1 text-sm outline-none focus:border-lp-border"
            placeholder="SB"
          />
        </div>
        <div className="w-24 shrink-0 self-center px-0.5">
          <input
            type="text"
            value={local.position}
            onChange={(e) => queue({ position: e.target.value })}
            onBlur={() => void saveRow.flush()}
            list={posListId}
            className="w-full border-0 border-b border-transparent bg-transparent py-1 text-sm outline-none focus:border-lp-border"
            placeholder="Pos"
          />
          <datalist id={posListId}>
            {POSITION_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </div>
        <div className="min-w-0 w-28 shrink-0 self-center px-0.5">
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
            className="w-full min-w-0 border-0 border-b border-transparent bg-transparent py-1 text-sm outline-none focus:border-lp-border"
            placeholder="Mic"
          />
          <datalist id={`mic-hint-${row.id}`}>
            {mics.map((m) => (
              <option key={m.id} value={m.name} />
            ))}
          </datalist>
        </div>
        <div className="relative w-7 shrink-0 self-center pr-0.5">
          <button
            type="button"
            onClick={onRowMenuToggle}
            className="rounded p-1 text-lp-text-tertiary opacity-0 transition-opacity group-hover:opacity-100"
            aria-label="Row actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {rowMenu && (
            <div
              className="absolute right-0 z-20 mt-0 min-w-[120px] rounded-md border border-lp-border bg-lp-surface py-1 shadow-md"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-lp-text hover:bg-lp-surface-hover"
                onClick={async () => {
                  onRowMenuToggle();
                  const supabase = createClient();
                  await ch.duplicateRow(supabase, row.id, sectionId, packId);
                  await onRefresh();
                }}
              >
                Duplicate
              </button>
              <button
                type="button"
                className="w-full px-2 py-1.5 text-left text-xs text-lp-error hover:bg-lp-surface-hover"
                onClick={async () => {
                  if (!confirm('Delete this row?')) return;
                  onRowMenuToggle();
                  const supabase = createClient();
                  await ch.deleteRow(supabase, row.id);
                  await onRefresh();
                }}
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-lp-border-light bg-lp-bg px-12 py-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-x-4">
            <DetailField
              label="Mic substitute"
              value={local.mic_substitute}
              onChange={(v) => queue({ mic_substitute: v })}
              onFlush={() => void saveRow.flush()}
            />
            <DetailField
              label="DI"
              value={local.di}
              onChange={(v) => queue({ di: v })}
              onFlush={() => void saveRow.flush()}
            />
            <DetailField
              label="Stand"
              value={local.stand}
              onChange={(v) => queue({ stand: v })}
              onFlush={() => void saveRow.flush()}
            />
            <div>
              <div className="text-xs text-lp-text-tertiary">Phantom power</div>
              <button
                type="button"
                onClick={() => {
                  const next = cyclePhantom(local.phantom_power);
                  queue({ phantom_power: next });
                  void saveRow.flush();
                }}
                className="mt-0.5 rounded border border-lp-border px-2 py-1 text-sm text-lp-text hover:bg-lp-surface-hover"
              >
                {labelPhantom(local.phantom_power)}
              </button>
            </div>
            <div>
              <div className="text-xs text-lp-text-tertiary">Provider</div>
              <select
                value={local.provider ?? ''}
                onChange={(e) => {
                  const v = e.target.value as '' | 'band' | 'venue' | 'hire';
                  const p: 'band' | 'venue' | 'hire' | null = v === '' ? null : v;
                  queue({ provider: p });
                }}
                onBlur={() => void saveRow.flush()}
                className="mt-0.5 w-full max-w-xs rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-lp-text"
              >
                <option value="">—</option>
                <option value="band">Band</option>
                <option value="venue">Venue</option>
                <option value="hire">Hire</option>
              </select>
              <p className="mt-1 text-xs text-lp-text-tertiary">
                Applies to mic / DI only — not stand or cable.
              </p>
            </div>
            <div className="sm:col-span-2">
              <div className="text-xs text-lp-text-tertiary">Notes</div>
              <textarea
                value={local.notes}
                onChange={(e) => queue({ notes: e.target.value })}
                onBlur={() => void saveRow.flush()}
                rows={3}
                className="mt-0.5 w-full rounded border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text"
                placeholder="Notes…"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailField({
  label,
  value,
  onChange,
  onFlush,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onFlush: () => void;
}) {
  return (
    <div>
      <div className="text-xs text-lp-text-tertiary">{label}</div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onFlush}
        className="mt-0.5 w-full rounded border border-lp-border bg-lp-surface px-2 py-1 text-sm text-lp-text"
      />
    </div>
  );
}
