'use client';

/* ============================================
   LOWPASS — <VersionSelector> (B2)

   The budget sub-bar control: a `vN · status ▾` button + a persistent "Current"
   pill for the approved version, opening a dropdown of every version (select →
   view read-only via ?version=). Token-clean: orange = approved/Current,
   muted = draft, grey = superseded.
   ============================================ */

import { useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown, Check, Lock, Unlock, GitBranch } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import {
  type BudgetVersionVm,
  versionStatusColor,
  STATUS_LABEL,
  approveVersion,
  unlockVersion,
  amendVersion,
} from './versionApi';

function ActionRow({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="btn-transition"
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        border: 0, background: 'transparent', borderRadius: 'var(--lp-radius-sm)',
        padding: '6px 8px', fontSize: 12, fontWeight: 600,
        color: 'var(--lp-orange)', cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: BudgetVersionVm['status'] }) {
  const c = versionStatusColor(status);
  const label = status === 'approved' ? 'Current' : STATUS_LABEL[status];
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', borderRadius: 'var(--lp-radius-full)',
        padding: '1px 8px', fontSize: 10, fontWeight: 700, textTransform: 'capitalize',
        background: c.bg, color: c.fg,
        border: status === 'approved' ? 'none' : '1px solid var(--lp-border)',
      }}
    >
      {label}
    </span>
  );
}

export function VersionSelector({
  tourId,
  versions,
  viewedVersionId,
  canApprove = false,
}: {
  tourId: string;
  versions: BudgetVersionVm[];
  viewedVersionId: string | null;
  /** Approver capability (RPC is_budget_approver) — gates the inline
   *  approve / unlock / amend actions in the dropdown (B2 lived in Settings;
   *  #27 surfaces it on the chip directly). */
  canApprove?: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const pathname = usePathname() ?? `/budget/${tourId}`;
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!versions.length) return null;

  const viewed = versions.find((v) => v.id === viewedVersionId) ?? versions[versions.length - 1];
  const approved = versions.find((v) => v.status === 'approved');

  // State-fix B1 — the default landing (no ?version=) is the approved Current if
  // one exists, else the draft head (mirrors page.tsx). Selecting the default
  // clears ?version=; selecting anything else (incl. the draft head when a Current
  // exists) sets it — so you can actually view the draft.
  const headId = [...versions].reverse().find((v) => v.status !== 'superseded' && v.status !== 'rolled_back')?.id ?? viewed.id;
  const defaultId = approved?.id ?? headId;
  const go = (versionId: string) => {
    const params = new URLSearchParams(searchParams);
    if (versionId === defaultId) params.delete('version');
    else params.set('version', versionId);
    setOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  };

  // Inline approve / unlock / amend on the VIEWED version — mirrors
  // VersionApprovalCard.act (server enforces the approver gate; here we hide
  // the affordances for non-approvers). `push` navigates to a freshly-created
  // amend version; otherwise just refresh the server data.
  const act = async (fn: () => Promise<Response>, push?: (id: string) => string) => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fn();
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(typeof j.error === 'string' ? j.error : `Failed (${res.status})`);
      }
      setOpen(false);
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

  const canAct = canApprove && (viewed.status === 'draft' || viewed.status === 'approved');

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      {/* Persistent orientation cue: "Viewing v{n} · {status}" so you always know
          which version + lock state you're on (state-fix B1). */}
      <span style={{ fontSize: 11, color: 'var(--lp-text-tertiary)' }}>Viewing</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="btn-transition"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--lp-border)',
          borderRadius: 'var(--lp-radius-full)', padding: '3px 10px', fontSize: 12, fontWeight: 600,
          background: 'var(--lp-panel)', color: 'var(--lp-text)', cursor: 'pointer',
        }}
        aria-haspopup="listbox" aria-expanded={open}
      >
        v{viewed.version_number}
        <StatusPill status={viewed.status} />
        <ChevronDown size={13} aria-hidden />
      </button>

      {/* persistent Current reference (the approved baseline) — always shown when
          one exists, so "— Current v{approved}" is always visible. */}
      {approved ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          {approved.id === viewed.id ? '— this is Current' : <><span aria-hidden>—</span> <StatusPill status="approved" /> v{approved.version_number}</>}
        </span>
      ) : null}

      {open ? (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div
            role="listbox"
            style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50, minWidth: 200,
              background: 'var(--lp-panel)', border: '1px solid var(--lp-border)',
              borderRadius: 'var(--lp-radius-md)', boxShadow: 'var(--lp-shadow-lg, 0 8px 24px rgba(0,0,0,0.3))',
              padding: 4,
            }}
          >
            {[...versions].reverse().map((v) => (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={v.id === viewed.id}
                onClick={() => go(v.id)}
                className="btn-transition"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
                  border: 0, background: v.id === viewed.id ? 'var(--lp-surface)' : 'transparent',
                  borderRadius: 'var(--lp-radius-sm)', padding: '6px 8px', fontSize: 12, color: 'var(--lp-text)', cursor: 'pointer',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  {v.id === viewed.id ? <Check size={12} aria-hidden /> : <span style={{ width: 12 }} />}
                  v{v.version_number}
                </span>
                <StatusPill status={v.status} />
              </button>
            ))}

            {/* Inline approve / unlock / amend on the viewed version (#27 — was
                Settings-only). Approver-gated; the server re-checks. */}
            {canAct ? (
              <div style={{ borderTop: '1px solid var(--lp-border)', marginTop: 4, paddingTop: 4 }}>
                {viewed.status === 'draft' ? (
                  <ActionRow
                    icon={<Lock size={12} aria-hidden />}
                    label={busy ? 'Approving…' : 'Approve & lock'}
                    disabled={busy}
                    onClick={() => void act(() => approveVersion(viewed.id))}
                  />
                ) : (
                  <>
                    <ActionRow
                      icon={<Unlock size={12} aria-hidden />}
                      label={busy ? 'Working…' : 'Unlock & re-approve'}
                      disabled={busy}
                      onClick={() => void act(() => unlockVersion(viewed.id))}
                    />
                    <ActionRow
                      icon={<GitBranch size={12} aria-hidden />}
                      label={busy ? 'Working…' : 'New version from approved'}
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () => amendVersion(viewed.id),
                          (id) => `/budget/${tourId}?tab=budget&version=${id}`,
                        )
                      }
                    />
                  </>
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
