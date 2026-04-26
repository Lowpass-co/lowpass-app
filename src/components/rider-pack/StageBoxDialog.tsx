'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import type { StageBox } from '@/lib/rider-packs/types';
import {
  clearStageBoxPositionsAbove,
  createStageBox,
  deleteStageBox,
  listChannelRowsStageBoxAbovePosition,
  listStageBoxes,
  updateStageBox,
} from '@/lib/rider-packs/channel-list';
import { SUB_SNAKE_PALETTE } from './SubSnakeDialog';

function nextPaletteColour(existing: StageBox[]): string {
  const used = new Set(existing.map((s) => s.colour.toLowerCase()));
  for (const c of SUB_SNAKE_PALETTE) {
    if (!used.has(c.toLowerCase())) return c;
  }
  return SUB_SNAKE_PALETTE[existing.length % SUB_SNAKE_PALETTE.length];
}

type Props = {
  open: boolean;
  onClose: () => void;
  packId: string;
  sectionId: string;
  onChanged: () => void | Promise<void>;
};

export default function StageBoxDialog({ open, onClose, packId, sectionId, onChanged }: Props) {
  const [list, setList] = useState<StageBox[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const rows = await listStageBoxes(supabase, sectionId);
    setList(rows);
  }, [sectionId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const addNew = async () => {
    const supabase = createClient();
    const colour = nextPaletteColour(list);
    const created = await createStageBox(supabase, {
      packId,
      sectionId,
      label: 'New box',
      colour,
      capacity: 16,
    });
    setList((prev) => [...prev, created].sort((a, b) => a.position - b.position));
    await onChanged();
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="mx-4 max-h-[min(90vh,560px)] w-full max-w-lg overflow-hidden rounded-2xl border border-lp-border bg-lp-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-lp-border px-4 py-3">
          <h2 className="text-sm font-semibold text-lp-text">Stage I/O</h2>
          <p className="mt-0.5 text-xs text-lp-text-secondary">Label each stage box, set capacity, and assign in the I/O column.</p>
        </div>
        <div className="max-h-[min(60vh,400px)] space-y-2 overflow-y-auto p-4">
          {list.map((s) => (
            <StageBoxRow
              key={s.id}
              row={s}
              onPickerToggle={() => setPickerFor((id) => (id === s.id ? null : s.id))}
              showPicker={pickerFor === s.id}
              onClosePicker={() => setPickerFor(null)}
              onUpdateColour={async (hex: string) => {
                const supabase = createClient();
                await updateStageBox(supabase, s.id, { colour: hex });
                setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, colour: hex } : x)));
                await onChanged();
              }}
              onDelete={async () => {
                if (!confirm('Remove this stage box?')) return;
                const supabase = createClient();
                await deleteStageBox(supabase, s.id);
                setList((prev) => prev.filter((x) => x.id !== s.id));
                setPickerFor(null);
                await onChanged();
              }}
              onLabelSaved={async () => onChanged()}
              onCapacityCommit={async (next: number) => {
                const supabase = createClient();
                const prevCap = s.capacity ?? 16;
                if (next < prevCap) {
                  const over = await listChannelRowsStageBoxAbovePosition(supabase, s.id, next);
                  if (over.length > 0) {
                    const pos = over.map((r) => r.stage_box_position).filter((p): p is number => p != null);
                    if (
                      !confirm(
                        `Lowering capacity will unassign ${over.length} channel(s) (positions ${pos.join(', ')}). Continue?`,
                      )
                    ) {
                      return 'cancelled';
                    }
                    await clearStageBoxPositionsAbove(supabase, s.id, next);
                  }
                }
                if (next === prevCap) return 'ok';
                await updateStageBox(supabase, s.id, { capacity: next });
                setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, capacity: next } : x)));
                await onChanged();
                return 'ok';
              }}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-lp-border p-4">
          <button
            type="button"
            onClick={() => void addNew()}
            className="w-full rounded-lg border border-dashed border-lp-border py-2 text-sm text-lp-text-secondary hover:bg-lp-surface-hover"
          >
            + Add stage box
          </button>
          <button type="button" onClick={onClose} className="text-sm text-lp-text-secondary hover:text-lp-text">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function StageBoxRow({
  row: s,
  onPickerToggle,
  showPicker,
  onClosePicker,
  onUpdateColour,
  onDelete,
  onLabelSaved,
  onCapacityCommit,
}: {
  row: StageBox;
  onPickerToggle: () => void;
  showPicker: boolean;
  onClosePicker: () => void;
  onUpdateColour: (hex: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onLabelSaved: () => void | Promise<void>;
  onCapacityCommit: (next: number) => Promise<'ok' | 'cancelled'>;
}) {
  const [label, setLabel] = useState(s.label);
  const [hexDraft, setHexDraft] = useState(s.colour);
  const [capDraft, setCapDraft] = useState(String(s.capacity ?? 16));

  const save = useDebouncedSave(
    useCallback(
      async (v: string) => {
        if (v === s.label) return;
        const supabase = createClient();
        await updateStageBox(supabase, s.id, { label: v });
        await onLabelSaved();
      },
      [s.id, s.label, onLabelSaved],
    ),
    400,
  );
  useEffect(() => {
    if (save.isPending()) return;
    setLabel(s.label);
  }, [s.label, save]);

  useEffect(() => {
    setCapDraft(String(s.capacity ?? 16));
  }, [s.capacity]);

  useEffect(() => {
    if (showPicker) setHexDraft(s.colour);
  }, [showPicker, s.colour]);

  return (
    <div className="flex flex-wrap items-start gap-2 rounded-lg border border-lp-border bg-lp-surface p-2">
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={onPickerToggle}
          className="mt-0.5 h-8 w-8 rounded-md"
          style={{
            backgroundColor: s.colour,
            border: `1px solid ${s.colour}99`,
          }}
          title="Change colour"
          aria-label="Change colour"
        />
        {showPicker && (
          <div
            className="absolute left-0 z-[60] mt-1 flex w-56 flex-col gap-2 rounded-lg border border-lp-border bg-lp-surface p-2 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid grid-cols-4 gap-1">
              {SUB_SNAKE_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-7 rounded border border-lp-border"
                  style={{ backgroundColor: c }}
                  onClick={() => {
                    void onUpdateColour(c);
                    onClosePicker();
                  }}
                  aria-label={`Pick ${c}`}
                />
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-lp-text-tertiary">
              Picker
              <input
                type="color"
                value={/^#[0-9A-Fa-f]{6}$/.test(hexDraft) ? hexDraft : '#3b82f6'}
                onChange={(e) => {
                  setHexDraft(e.target.value);
                  void onUpdateColour(e.target.value);
                }}
                className="h-8 w-14 cursor-pointer rounded border border-lp-border bg-transparent p-0"
              />
            </label>
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={hexDraft}
                onChange={(e) => setHexDraft(e.target.value)}
                placeholder="#3B82F6"
                className="w-full rounded border border-lp-border px-2 py-1 font-mono text-xs text-lp-text"
              />
              <button
                type="button"
                onClick={() => {
                  const h = hexDraft.trim();
                  if (/^#[0-9A-Fa-f]{6}$/.test(h)) {
                    void onUpdateColour(h);
                    onClosePicker();
                  }
                }}
                className="shrink-0 text-xs text-lp-orange"
              >
                Set
              </button>
            </div>
            <button type="button" onClick={onClosePicker} className="text-xs text-lp-text-secondary">
              Close
            </button>
          </div>
        )}
      </div>
      <input
        type="text"
        value={label}
        onChange={(e) => {
          const v = e.target.value;
          setLabel(v);
          save.schedule(v);
        }}
        onBlur={() => {
          void save.flush();
        }}
        className="min-w-0 flex-1 rounded border border-lp-border bg-lp-bg px-2 py-1 text-sm text-lp-text"
      />
      <label className="flex shrink-0 items-center gap-1 text-xs text-lp-text-tertiary">
        <span className="whitespace-nowrap">Cap</span>
        <input
          type="number"
          min={1}
          max={64}
          value={capDraft}
          onChange={(e) => setCapDraft(e.target.value)}
          onBlur={async () => {
            const n = Math.min(64, Math.max(1, Math.round(parseInt(capDraft, 10) || 1)));
            setCapDraft(String(n));
            const r = await onCapacityCommit(n);
            if (r === 'cancelled') setCapDraft(String(s.capacity ?? 16));
          }}
          className="w-12 rounded border border-lp-border bg-lp-bg px-1 py-1 text-sm tabular-nums text-lp-text"
        />
      </label>
      <button
        type="button"
        onClick={() => void onDelete()}
        className="shrink-0 text-xs text-lp-text-tertiary hover:text-lp-error"
      >
        Delete
      </button>
    </div>
  );
}
