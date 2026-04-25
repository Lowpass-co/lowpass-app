'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import { createClient } from '@/lib/supabase-client';
import type { SectionStageIO } from '@/lib/rider-packs/types';
import { SUB_SNAKE_PALETTE } from './SubSnakeDialog';
import {
  createStageIO,
  deleteStageIO,
  listStageIO,
  updateStageIO,
} from '@/lib/rider-packs/channel-list';

function nextPaletteColour(existing: SectionStageIO[]): string {
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

export default function StageIoDialog({ open, onClose, packId, sectionId, onChanged }: Props) {
  const [list, setList] = useState<SectionStageIO[]>([]);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const rows = await listStageIO(supabase, sectionId);
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
    const created = await createStageIO(supabase, {
      packId,
      sectionId,
      label: 'New I/O',
      colour,
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
          <p className="mt-0.5 text-xs text-lp-text-secondary">Labels for the I/O column (e.g. 16A, 16B).</p>
        </div>
        <div className="max-h-[min(60vh,400px)] space-y-2 overflow-y-auto p-4">
          {list.map((s) => (
            <StageIoRow
              key={s.id}
              row={s}
              onPickerToggle={() => setPickerFor((id) => (id === s.id ? null : s.id))}
              showPicker={pickerFor === s.id}
              onClosePicker={() => setPickerFor(null)}
              onUpdateColour={async (hex: string) => {
                const supabase = createClient();
                await updateStageIO(supabase, s.id, { colour: hex });
                setList((prev) => prev.map((x) => (x.id === s.id ? { ...x, colour: hex } : x)));
                await onChanged();
              }}
              onDelete={async () => {
                if (!confirm('Remove this I/O label?')) return;
                const supabase = createClient();
                await deleteStageIO(supabase, s.id);
                setList((prev) => prev.filter((x) => x.id !== s.id));
                setPickerFor(null);
                await onChanged();
              }}
              onLabelSaved={async () => onChanged()}
            />
          ))}
        </div>
        <div className="flex flex-col gap-2 border-t border-lp-border p-4">
          <button
            type="button"
            onClick={() => void addNew()}
            className="w-full rounded-lg border border-lp-border bg-lp-bg-secondary py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            + Add I/O label
          </button>
          <button type="button" onClick={onClose} className="text-sm text-lp-text-secondary hover:text-lp-text">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function StageIoRow({
  row: s,
  onPickerToggle,
  showPicker,
  onClosePicker,
  onUpdateColour,
  onDelete,
  onLabelSaved,
}: {
  row: SectionStageIO;
  onPickerToggle: () => void;
  showPicker: boolean;
  onClosePicker: () => void;
  onUpdateColour: (hex: string) => void | Promise<void>;
  onDelete: () => void | Promise<void>;
  onLabelSaved: () => void | Promise<void>;
}) {
  const [label, setLabel] = useState(s.label);
  const [hexDraft, setHexDraft] = useState(s.colour);

  const save = useDebouncedSave(
    useCallback(
      async (v: string) => {
        if (v === s.label) return;
        await updateStageIO(createClient(), s.id, { label: v });
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
    if (showPicker) setHexDraft(s.colour);
  }, [showPicker, s.colour]);

  return (
    <div className="flex items-start gap-2 rounded-lg border border-lp-border bg-lp-surface p-2">
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
