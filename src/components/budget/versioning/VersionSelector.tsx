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
import { ChevronDown, Check } from 'lucide-react';
import { type BudgetVersionVm, versionStatusColor } from './versionApi';

function StatusPill({ status }: { status: BudgetVersionVm['status'] }) {
  const c = versionStatusColor(status);
  const label = status === 'approved' ? 'Current' : status;
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
}: {
  tourId: string;
  versions: BudgetVersionVm[];
  viewedVersionId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? `/budget/${tourId}`;
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  if (!versions.length) return null;

  const viewed = versions.find((v) => v.id === viewedVersionId) ?? versions[versions.length - 1];
  const approved = versions.find((v) => v.status === 'approved');

  const go = (versionId: string, isHead: boolean) => {
    const params = new URLSearchParams(searchParams);
    if (isHead) params.delete('version');
    else params.set('version', versionId);
    setOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  };
  // the "head" (active) version = highest non-superseded; selecting it clears ?version.
  const headId = [...versions].reverse().find((v) => v.status !== 'superseded')?.id ?? viewed.id;

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
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

      {/* persistent Current chip on the bar (the approved baseline) */}
      {approved && approved.id !== viewed.id ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--lp-text-tertiary)' }}>
          <StatusPill status="approved" /> v{approved.version_number}
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
                onClick={() => go(v.id, v.id === headId)}
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
          </div>
        </>
      ) : null}
    </div>
  );
}
