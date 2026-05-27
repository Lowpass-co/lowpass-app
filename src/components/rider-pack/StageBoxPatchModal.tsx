'use client';

/* ============================================
   LOWPASS — <StageBoxPatchModal> (Polish Sprint §CL2)

   Routing matrix for patching a whole stage box in one move.
   Instead of editing the Stage Box column on each of N input
   rows individually, the user opens this modal from the
   Stage Boxes inventory aggregate, sees a grid of every port
   on the box, and assigns channels + loom + cable per port.

   Layout:
     Port | Channel              | Loom    | Cable
     1    [KICK IN ▾]            [A ▾]    [6' ▾]
     2    [— unused —]           [—]      [—]
     ...
     N    (= stage_box.capacity)

   The Channel dropdown lists every input row that's either
   currently assigned to THIS box OR currently unassigned —
   so swapping rows between ports is a single dropdown change.

   Save commits each affected row via ch.updateRow
   sequentially, fires onSaved on success. Cancel discards
   local edits (confirmation prompt if dirty).

   Data model: no schema changes. Uses
   channel_list_rows.stage_box_id + stage_box_position +
   sub_snake_id + sub_snake_position + cable_length —
   all from migration 046.
   ============================================ */

import { useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import * as ch from '@/lib/rider-packs/channel-list';
import type {
  ChannelListRow,
  StageBox,
  SubSnake,
} from '@/lib/rider-packs/types';

/* Mirror of CableLengthSelectCell's LENGTHS list. Kept local
   here so the modal can render plain <select>s without
   pulling in the BrandedSelect machinery — keeps the modal
   self-contained at the cost of a small repeat. */
const CABLE_LENGTHS: ReadonlyArray<{ value: string; label: string }> = [
  { value: '', label: '—' },
  { value: "6'", label: "6′" },
  { value: "10'", label: "10′" },
  { value: "15'", label: "15′" },
  { value: "25'", label: "25′" },
  { value: "50'", label: "50′" },
  { value: "100'", label: "100′" },
  { value: "150'", label: "150′" },
  { value: "300'", label: "300′" },
];

interface PortDraft {
  /** Selected channel_list_rows.id for this port. null = unused. */
  rowId: string | null;
  loomId: string | null;
  loomPosition: number | null;
  cable: string | null;
}

interface Props {
  stageBox: StageBox;
  /** All input rows from the section. The dropdown filters to
   *  unassigned + rows currently on this box. */
  inputRows: ChannelListRow[];
  subSnakes: SubSnake[];
  onClose: () => void;
  /** Fires after successful save so the parent can refetch. */
  onSaved: () => void | Promise<void>;
}

export function StageBoxPatchModal({
  stageBox,
  inputRows,
  subSnakes,
  onClose,
  onSaved,
}: Props) {
  /* Build initial port drafts from the rows currently assigned
     to this box. Ports beyond what's assigned start unused. */
  const initialPorts = useMemo<PortDraft[]>(() => {
    const ports: PortDraft[] = Array.from({ length: stageBox.capacity }, () => ({
      rowId: null,
      loomId: null,
      loomPosition: null,
      cable: null,
    }));
    for (const r of inputRows) {
      if (r.stage_box_id !== stageBox.id) continue;
      if (r.stage_box_position == null) continue;
      const idx = r.stage_box_position - 1;
      if (idx < 0 || idx >= ports.length) continue;
      ports[idx] = {
        rowId: r.id,
        loomId: r.sub_snake_id,
        loomPosition: r.sub_snake_position,
        cable: r.cable_length,
      };
    }
    return ports;
  }, [stageBox.id, stageBox.capacity, inputRows]);

  const [ports, setPorts] = useState<PortDraft[]>(initialPorts);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* Esc closes (with dirty confirm). */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Available channels for a given port's dropdown: every row
     that's either currently on this box OR currently
     unassigned to any box, PLUS the row already selected for
     this port (so it stays visible when reopening). Rows
     selected for OTHER ports in the modal are excluded so a
     channel can't be on two ports simultaneously. */
  const availableForPort = (portIdx: number): ChannelListRow[] => {
    const claimedElsewhereInModal = new Set(
      ports
        .map((p, i) => (i === portIdx ? null : p.rowId))
        .filter((id): id is string => !!id),
    );
    return inputRows.filter((r) => {
      if (claimedElsewhereInModal.has(r.id)) return false;
      const onThisBox = r.stage_box_id === stageBox.id;
      const unassigned = r.stage_box_id == null;
      const currentlySelectedHere = ports[portIdx]?.rowId === r.id;
      return onThisBox || unassigned || currentlySelectedHere;
    });
  };

  const isDirty = useMemo(() => {
    for (let i = 0; i < ports.length; i++) {
      const a = ports[i];
      const b = initialPorts[i];
      if (a.rowId !== b.rowId) return true;
      if (a.loomId !== b.loomId) return true;
      if (a.loomPosition !== b.loomPosition) return true;
      if ((a.cable ?? null) !== (b.cable ?? null)) return true;
    }
    return false;
  }, [ports, initialPorts]);

  function setPort(idx: number, patch: Partial<PortDraft>) {
    setPorts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  function handleClose() {
    if (isDirty) {
      const ok = confirm('Discard your patch changes?');
      if (!ok) return;
    }
    onClose();
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const client = createClient();
      /* Compute the diff per row. Two cases:
           - A row newly placed on this box (or moved between
             ports) → patch its stage_box_* + loom + cable.
           - A row removed from this box (was here, now
             unassigned in the modal) → clear stage_box_*.
         Loom + cable changes only fire when they actually
         changed, so untouched ports don't spam PATCH. */
      type Change = { id: string; patch: Parameters<typeof ch.updateRow>[2] };
      const changes: Change[] = [];

      /* New / changed placements. */
      for (let i = 0; i < ports.length; i++) {
        const p = ports[i];
        const init = initialPorts[i];
        if (!p.rowId) continue;
        const portNum = i + 1;
        const patch: Parameters<typeof ch.updateRow>[2] = {};
        const initialRowOnThisPort = init.rowId === p.rowId;
        if (!initialRowOnThisPort) {
          patch.stage_box_id = stageBox.id;
          patch.stage_box_position = portNum;
        }
        if (p.loomId !== init.loomId || p.loomPosition !== init.loomPosition) {
          patch.sub_snake_id = p.loomId;
          patch.sub_snake_position = p.loomPosition;
        }
        if ((p.cable ?? null) !== (init.cable ?? null)) {
          patch.cable_length = p.cable;
        }
        if (Object.keys(patch).length > 0) {
          changes.push({ id: p.rowId, patch });
        }
      }

      /* Rows removed from this box (was at port N, now
         no rowId at port N or moved elsewhere). */
      const newSelectedSet = new Set(
        ports.map((p) => p.rowId).filter((id): id is string => !!id),
      );
      for (const init of initialPorts) {
        if (!init.rowId) continue;
        if (newSelectedSet.has(init.rowId)) continue;
        changes.push({
          id: init.rowId,
          patch: { stage_box_id: null, stage_box_position: null },
        });
      }

      for (const c of changes) {
        await ch.updateRow(client, c.id, c.patch);
      }
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={handleClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border shadow-2xl"
        style={{
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border-strong)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block h-3 w-3 rounded-sm border"
              style={{
                background: stageBox.colour,
                borderColor: 'var(--lp-border)',
              }}
            />
            <h2 className="text-sm font-semibold text-lp-text">
              Patch {stageBox.label} ({stageBox.capacity} ports)
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            className="rounded p-1 text-lp-text-tertiary hover:bg-lp-surface-hover hover:text-lp-text"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Port grid */}
        <div className="overflow-y-auto px-4 py-3">
          <div
            className="grid items-center gap-2 border-b pb-2 text-[10px] font-bold uppercase tracking-wider text-lp-text-tertiary"
            style={{
              gridTemplateColumns: '3rem minmax(0, 1.6fr) minmax(0, 0.8fr) minmax(0, 0.6fr)',
              borderColor: 'var(--lp-border)',
            }}
          >
            <div>Port</div>
            <div>Channel</div>
            <div>Loom</div>
            <div>Cable</div>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--lp-border-light)' }}>
            {ports.map((port, idx) => {
              const portNum = idx + 1;
              const channels = availableForPort(idx);
              return (
                <div
                  key={idx}
                  className="grid items-center gap-2 py-1.5"
                  style={{
                    gridTemplateColumns:
                      '3rem minmax(0, 1.6fr) minmax(0, 0.8fr) minmax(0, 0.6fr)',
                  }}
                >
                  <div className="font-mono text-xs text-lp-text-tertiary">
                    {portNum}
                  </div>
                  <select
                    value={port.rowId ?? ''}
                    onChange={(e) =>
                      setPort(idx, { rowId: e.target.value || null })
                    }
                    className="min-w-0 rounded border border-lp-border bg-lp-bg px-2 py-1 text-xs text-lp-text outline-none focus:border-lp-orange/40"
                  >
                    <option value="">— unused —</option>
                    {channels.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.row_index}. {r.channel_name || '(no name)'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={port.loomId ?? ''}
                    onChange={(e) => {
                      const id = e.target.value || null;
                      setPort(idx, {
                        loomId: id,
                        /* Clear the position when the loom
                           changes — the user re-picks a port
                           on the new loom in the Mic-DI editor
                           (this modal doesn't surface loom
                           ports to keep the grid tight). */
                        loomPosition: null,
                      });
                    }}
                    disabled={!port.rowId}
                    className="min-w-0 rounded border border-lp-border bg-lp-bg px-2 py-1 text-xs text-lp-text outline-none focus:border-lp-orange/40 disabled:opacity-50"
                  >
                    <option value="">—</option>
                    {subSnakes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value={port.cable ?? ''}
                    onChange={(e) =>
                      setPort(idx, { cable: e.target.value || null })
                    }
                    disabled={!port.rowId}
                    className="min-w-0 rounded border border-lp-border bg-lp-bg px-2 py-1 text-xs text-lp-text outline-none focus:border-lp-orange/40 disabled:opacity-50"
                  >
                    {CABLE_LENGTHS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <footer
          className="flex items-center justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          {error ? (
            <span className="mr-auto text-xs text-lp-error">{error}</span>
          ) : null}
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-lp-border bg-lp-bg px-3 py-1.5 text-sm text-lp-text hover:bg-lp-surface-hover"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-1.5 rounded-lg bg-lp-orange px-3 py-1.5 text-sm font-medium text-white hover:bg-lp-orange/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save patch
          </button>
        </footer>
      </div>
    </div>
  );
}
