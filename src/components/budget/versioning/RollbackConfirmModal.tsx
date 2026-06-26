'use client';

/* ============================================
   LOWPASS — <RollbackConfirmModal> (Versioning STATE/NAV B2)

   "Make this version Current." Enumerates EVERY affected version by number +
   current status — the former Current + everything newer (incl. any in-progress
   draft head, whose work is discarded) — then POSTs …/rollback. The draft-loss
   line is the safety gate; the modal never auto-dismisses.

   The affected set mirrors the budget_version_rollback RPC exactly:
     id <> target AND (status = 'approved' OR version_number > target.number)
   ============================================ */

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { rollbackVersion, STATUS_LABEL, type BudgetVersionVm } from './versionApi';

/** The versions the rollback will mark `rolled_back` (matches the RPC's demotion). */
export function rollbackAffected(versions: BudgetVersionVm[], target: BudgetVersionVm): BudgetVersionVm[] {
  return versions
    .filter((v) => v.id !== target.id && (v.status === 'approved' || v.version_number > target.version_number))
    .sort((a, b) => a.version_number - b.version_number);
}

export function RollbackConfirmModal({
  open,
  versions,
  target,
  onClose,
}: {
  open: boolean;
  versions: BudgetVersionVm[];
  target: BudgetVersionVm | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!open || !target) return null;

  const affected = rollbackAffected(versions, target);
  const losesDraft = affected.some((v) => v.status === 'draft');

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await rollbackVersion(target.id);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Failed (${res.status})`);
      }
      // Land on the target EXPLICITLY (?version=target.id), not a cleared ?version
      // that re-resolves the default/head. The target is now the approved Current,
      // and — crucially — it is guaranteed non-draft (the rollback guard rejects a
      // draft target), so `versionLocked = status !== 'draft'` is TRUE on the very
      // first render after navigation, even against the stale RSC cache (the
      // pre-refresh render). This kills the post-rollback "rolled-back version
      // briefly editable" race: the viewed version is deterministically locked
      // before router.refresh() brings the fresh `approved` status.
      const params = new URLSearchParams(searchParams);
      params.set('version', target.id);
      onClose();
      router.push(`${pathname}?${params.toString()}`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Rollback failed', 'error');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog" aria-modal="true" onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-command-palette)' as unknown as number,
        background: 'color-mix(in srgb, var(--lp-bg-deep) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--lp-space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 480, width: '100%', background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)',
          padding: 'var(--lp-space-5)', boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 8 }}>
          Make v{target.version_number} the Current version?
        </h3>
        <p style={{ fontSize: 13, color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-3)' }}>
          v{target.version_number} becomes the approved Current (locked baseline). The following
          {affected.length === 1 ? ' version' : ' versions'} will be marked <strong>rolled-back</strong>:
        </p>

        <ul style={{ margin: '0 0 var(--lp-space-3)', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {affected.length === 0 ? (
            <li style={{ fontSize: 13, color: 'var(--lp-text-tertiary)' }}>None — nothing is newer than this version.</li>
          ) : (
            affected.map((v) => (
              <li key={v.id} style={{ fontSize: 13, color: 'var(--lp-text)' }}>
                <span style={{ fontWeight: 600 }}>v{v.version_number}</span>{' '}
                <span style={{ color: 'var(--lp-text-tertiary)' }}>
                  ({STATUS_LABEL[v.status]}{v.status === 'draft' ? ' — unsaved working copy' : ''})
                </span>
              </li>
            ))
          )}
        </ul>

        {losesDraft ? (
          <p
            style={{
              fontSize: 12, color: 'var(--color-lp-error)', marginBottom: 'var(--lp-space-4)',
              background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)',
              borderRadius: 'var(--lp-radius-md)', padding: '8px 10px',
            }}
          >
            ⚠ A working <strong>draft</strong> is among these — its unsaved proposed changes will be
            discarded. This can’t be undone (you can roll forward later, but the draft work is gone).
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button" onClick={onClose} disabled={busy}
            className="btn-transition"
            style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button" onClick={() => void confirm()} disabled={busy}
            className="btn-transition"
            style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: 'pointer' }}
          >
            {busy ? 'Working…' : `Make v${target.version_number} Current`}
          </button>
        </div>
      </div>
    </div>
  );
}
