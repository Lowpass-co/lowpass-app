'use client';

/* ============================================
   LOWPASS — <VersionApprovalCard> (B2, Settings tab)

   Approve (draft → lock + Current) / Unlock (approved → draft) / New version
   (amend the approved → draft v(n+1)). Every action is approver-gated — the
   server enforces it; here we hide the affordances for non-approvers and show a
   read-only status line. Optional note on approve.
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/Toast';
import { approveVersion, unlockVersion, amendVersion, type BudgetVersionVm } from './versionApi';

export function VersionApprovalCard({
  tourId,
  versions,
  activeVersionId,
  canApprove,
}: {
  tourId: string;
  versions: BudgetVersionVm[];
  activeVersionId: string | null;
  canApprove: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const active = versions.find((v) => v.id === activeVersionId) ?? versions[versions.length - 1] ?? null;
  const approved = versions.find((v) => v.status === 'approved') ?? null;

  const act = async (fn: () => Promise<Response>, push?: (id: string) => string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Failed (${res.status})`);
      }
      if (push) {
        const v = await res.json();
        router.push(push(v.id));
      }
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="rounded-xl border border-lp-border p-4"
      style={{ background: 'var(--lp-panel)' }}
    >
      <h3 className="text-sm font-semibold text-lp-text">Versions &amp; approval</h3>
      <p className="mt-1 text-xs text-lp-text-secondary">
        Approving locks the proposed budget as the baseline; actuals keep flowing. Variance is measured against the approved version.
      </p>

      <div className="mt-3 flex items-center gap-2 text-sm text-lp-text">
        <span className="text-lp-text-secondary">Active:</span>
        {active ? <span className="font-medium">v{active.version_number} · {active.status}</span> : <span>—</span>}
        {approved ? <span className="text-xs text-lp-text-tertiary">(Current: v{approved.version_number})</span> : null}
      </div>

      {!canApprove ? (
        <p className="mt-3 text-xs text-lp-text-tertiary">
          You don&rsquo;t have budget-approver permission. Ask an approver to lock, unlock, or create a new version.
        </p>
      ) : active?.status === 'draft' ? (
        <div className="mt-3 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional) — e.g. 'Approved at production meeting'"
            className="w-full rounded-md border border-lp-border bg-lp-surface px-2 py-1.5 text-sm text-lp-text"
          />
          <button
            type="button"
            disabled={busy || !active}
            onClick={() => active && void act(() => approveVersion(active.id, note.trim() || undefined))}
            className="btn-transition rounded-md px-3 py-1.5 text-sm font-semibold text-lp-text-inverse disabled:opacity-60"
            style={{ background: 'var(--lp-orange)' }}
          >
            {busy ? 'Approving…' : 'Approve & lock'}
          </button>
        </div>
      ) : active?.status === 'approved' ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => unlockVersion(active.id))}
            className="btn-transition rounded-md px-3 py-1.5 text-sm font-semibold text-lp-text-inverse disabled:opacity-60"
            style={{ background: 'var(--lp-orange)' }}
          >
            {busy ? 'Working…' : 'Unlock & re-approve'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void act(() => amendVersion(active.id), (id) => `/budget/${tourId}?tab=budget&version=${id}`)}
            className="btn-transition rounded-md border border-lp-border px-3 py-1.5 text-sm font-medium text-lp-text disabled:opacity-60"
            style={{ background: 'var(--lp-surface)' }}
          >
            New version from approved
          </button>
        </div>
      ) : null}
    </section>
  );
}
