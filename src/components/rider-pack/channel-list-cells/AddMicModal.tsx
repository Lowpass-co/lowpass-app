'use client';

/* ============================================
   LOWPASS — <AddMicModal> (§CL-FIX-2)

   Inline "add a mic to the workspace library" dialog, opened
   from the MicDiSelectCell combobox when the operator types a
   mic name that isn't in mic_library yet. Saves straight to
   mic_library (workspace-scoped — RLS WITH CHECK requires
   workspace_id = get_my_workspace_id(), satisfied by passing
   pack.workspace_id) and hands the new row back so the cell
   can select it immediately.

   Field set matches the REAL mic_library schema (migration
   040): name, type (5-way enum), default_phantom. The spec's
   "default provider" field is intentionally omitted — there
   is no provider column on mic_library (provider is captured
   per-channel on the row), and adding one would be a separate
   migration.
   ============================================ */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { createClient } from '@/lib/supabase-client';
import { createMic } from '@/lib/rider-packs/mic-library';
import type { MicLibraryEntry } from '@/lib/rider-packs/types';

type MicType = MicLibraryEntry['type'];

const TYPE_OPTIONS: { value: MicType; label: string }[] = [
  { value: 'dynamic', label: 'Dynamic' },
  { value: 'condenser', label: 'Condenser' },
  { value: 'ribbon', label: 'Ribbon' },
  { value: 'di_active', label: 'Active DI' },
  { value: 'di_passive', label: 'Passive DI' },
];

/* Types that conventionally need +48V — selecting one nudges
   the phantom default on (the operator can still toggle it). */
const PHANTOM_BY_DEFAULT: ReadonlySet<MicType> = new Set<MicType>(['condenser', 'di_active']);

interface AddMicModalProps {
  open: boolean;
  /** Prefilled name (the text the operator typed in the cell). */
  initialName: string;
  /** Workspace the mic is scoped to (pack.workspace_id). */
  workspaceId: string;
  onClose: () => void;
  /** Fired with the freshly-inserted row after a successful save. */
  onCreated: (entry: MicLibraryEntry) => void;
}

export function AddMicModal({ open, initialName, workspaceId, onClose, onCreated }: AddMicModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(initialName);
  const [type, setType] = useState<MicType>('dynamic');
  const [phantom, setPhantom] = useState(false);
  const [saving, setSaving] = useState(false);

  /* Remount via key in the parent (key={initialName}) resets
     these, so we read initialName straight into state above. */

  const pickType = (t: MicType) => {
    setType(t);
    // Convenience: nudge phantom for condenser / active DI.
    if (PHANTOM_BY_DEFAULT.has(t)) setPhantom(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const entry = await createMic(createClient(), {
        workspaceId,
        name: trimmed,
        type,
        default_phantom: phantom,
      });
      onCreated(entry);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add mic', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add mic to library"
      subtitle="Saved to this workspace and selectable on any channel list."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!name.trim()}>
            Add mic
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-lp-text-secondary">Name</span>
          <input
            type="text"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim() && !saving) void save();
            }}
            placeholder="e.g. Shure SM7B"
            className="w-full rounded-lg border border-lp-border bg-lp-bg px-3 py-2 text-sm text-lp-text outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold text-lp-text-secondary">Type</span>
          <div className="flex flex-wrap gap-1.5">
            {TYPE_OPTIONS.map((opt) => {
              const active = opt.value === type;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => pickType(opt.value)}
                  aria-pressed={active}
                  className="rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-lp-orange)]"
                  style={{
                    borderColor: active ? 'var(--color-lp-orange)' : 'var(--lp-border)',
                    background: active
                      ? 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)'
                      : 'var(--lp-bg)',
                    color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-lp-border bg-lp-bg px-3 py-2">
          <span className="flex flex-col">
            <span className="text-xs font-semibold text-lp-text">Default +48V phantom</span>
            <span className="text-[11px] text-lp-text-tertiary">Applied to channels when this mic is picked.</span>
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={phantom}
            aria-label="Default phantom power"
            onClick={() => setPhantom((p) => !p)}
            className="relative h-5 w-9 shrink-0 rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--color-lp-orange)]"
            style={{
              background: phantom ? 'var(--color-lp-orange)' : 'var(--lp-border-strong)',
            }}
          >
            <span
              className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform"
              style={{ transform: phantom ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
        </label>
      </div>
    </Modal>
  );
}
