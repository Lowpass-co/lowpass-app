'use client';

/* ============================================
   LOWPASS — <VersionLockModal> (B2)

   Raised when a user tries to edit a version-locked PROPOSED cell, OR when a
   proposed write returns 423 VERSION_LOCKED. Offers: Unlock & re-approve (same
   version) or Create a new version (amend → draft v(n+1)). Approver-gated — a
   non-approver sees the explanation only (read-only).
   ============================================ */

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { unlockVersion, amendVersion, type VersionStatus } from './versionApi';

export function VersionLockModal({
  open,
  versionId,
  canApprove,
  tourId,
  viewedStatus = 'approved',
  draftVersionId = null,
  onClose,
}: {
  open: boolean;
  versionId: string | null;
  canApprove: boolean;
  tourId: string;
  /** State-fix B1 — the viewed version's status drives the modal: the approved
   *  Current offers Unlock/New-version; a historical (superseded/rolled-back)
   *  version offers "switch to the editable draft" instead. */
  viewedStatus?: VersionStatus;
  /** The editable draft head, for the "switch to draft" jump (null = none yet). */
  draftVersionId?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? `/budget/${tourId}`;
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  // A historical version (not the approved Current) is read-only — there's
  // nothing to unlock; point the user at the editable draft instead.
  const historical = viewedStatus !== 'approved';
  const goToDraft = () => {
    const params = new URLSearchParams(searchParams);
    if (draftVersionId) params.set('version', draftVersionId);
    else params.delete('version');
    onClose();
    router.push(`${pathname}?${params.toString()}`);
  };

  const run = async (kind: 'unlock' | 'amend') => {
    if (!versionId || busy) return;
    setBusy(true);
    try {
      const res = kind === 'unlock' ? await unlockVersion(versionId) : await amendVersion(versionId);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Failed (${res.status})`);
      }
      if (kind === 'amend') {
        const v = await res.json();
        router.push(`/budget/${tourId}?tab=budget&version=${v.id}`);
      }
      onClose();
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--lp-z-modal, 1000)' as unknown as number,
        background: 'color-mix(in srgb, var(--lp-bg-deep) 60%, transparent)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--lp-space-4)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 460, width: '100%', background: 'var(--lp-panel)',
          border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-lg)',
          padding: 'var(--lp-space-5)', boxShadow: 'var(--lp-shadow-lg, 0 12px 32px rgba(0,0,0,0.3))',
        }}
      >
        <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--lp-text)', marginBottom: 8 }}>
          {historical ? 'You’re viewing a historical version' : 'This budget is approved & locked'}
        </h3>
        <p style={{ fontSize: 13, color: 'var(--lp-text-secondary)', marginBottom: 'var(--lp-space-4)' }}>
          {historical
            ? 'This version is read-only — it’s not the editable draft. Switch to the working draft to make changes. Actuals stay editable on any version.'
            : canApprove
              ? 'The proposed budget is the approved baseline. Unlock & re-approve to edit it in place, or create a new version (a duplicate you can amend). Actuals stay editable either way.'
              : 'The proposed budget is the approved baseline and is read-only. Ask a budget approver to unlock it or create a new version. Actuals stay editable.'}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            type="button" onClick={onClose} disabled={busy}
            className="btn-transition"
            style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, color: 'var(--lp-text-secondary)', background: 'transparent', cursor: 'pointer' }}
          >
            {historical || !canApprove ? 'Close' : 'Cancel'}
          </button>
          {historical ? (
            <button
              type="button" onClick={goToDraft} disabled={busy}
              className="btn-transition"
              style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: 'pointer' }}
            >
              Switch to the draft
            </button>
          ) : canApprove ? (
            <>
              <button
                type="button" onClick={() => void run('amend')} disabled={busy}
                className="btn-transition"
                style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 600, color: 'var(--lp-text)', background: 'var(--lp-surface)', cursor: 'pointer' }}
              >
                Create a new version
              </button>
              <button
                type="button" onClick={() => void run('unlock')} disabled={busy}
                className="btn-transition"
                style={{ border: 0, borderRadius: 'var(--lp-radius-md)', padding: '6px 12px', fontSize: 13, fontWeight: 700, color: 'var(--lp-text-inverse)', background: 'var(--lp-orange)', cursor: 'pointer' }}
              >
                {busy ? 'Working…' : 'Unlock & re-approve'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
