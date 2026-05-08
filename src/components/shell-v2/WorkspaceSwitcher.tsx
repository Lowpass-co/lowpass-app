'use client';

/* ============================================
   LOWPASS — WorkspaceSwitcher (Sprint 9 §3)

   Always-shown workspace label that becomes a dropdown for
   users in 2+ workspaces. Mounted in AppShell to the left of
   <ArtistTourSwitcher>. Single-workspace users see the
   workspace name as a static label (no chevron, no dropdown).

   Per Adam's sign-off:
     - Always show as static label OR dropdown — gives users
       a "you are HERE" anchor.
     - Member count hidden in dropdown (workspace_members RLS
       is self-only; we can't count siblings cheaply).
     - "+ Create workspace" hidden until Sprint 10+.

   Switching calls POST /api/workspaces/switch and triggers
   router.refresh() so server components re-render under the
   new RLS scope.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ChevronDown, Loader2, Check } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import type { WorkspaceListItem, WorkspaceRole } from '@/lib/permissions/types';

function roleLabel(r: WorkspaceRole, isOwner: boolean): string {
  if (isOwner) return 'Owner';
  if (r === 'readonly') return 'Read-only';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { showToast } = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const fetchList = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces', { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { workspaces: WorkspaceListItem[] };
      setWorkspaces(body.workspaces);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList();
  }, [fetchList]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = workspaces.find((w) => w.is_active) ?? null;
  const hasMultiple = workspaces.length > 1;

  async function handleSwitch(targetId: string) {
    if (switching) return;
    setSwitching(targetId);
    try {
      const res = await fetch('/api/workspaces/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: targetId }),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        showToast(body?.error ?? 'Could not switch workspace.');
        return;
      }
      setOpen(false);
      // Reload server components under the new RLS scope.
      router.refresh();
      // Refetch list so is_active flips locally (avoids a flash).
      await fetchList();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSwitching(null);
    }
  }

  if (loading) {
    return (
      <span
        className="inline-flex items-center"
        style={{
          gap: 6,
          padding: '4px 8px',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        <Loader2 size={12} className="animate-spin" />
        Workspace…
      </span>
    );
  }

  if (workspaces.length === 0) return null;

  // Single workspace: static label, no dropdown.
  if (!hasMultiple) {
    return (
      <span
        className="inline-flex items-center"
        style={{
          gap: 6,
          padding: '4px 8px',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--lp-text-secondary)',
        }}
        title={active?.name}
      >
        <Building2 size={12} strokeWidth={2.4} />
        <span className="truncate" style={{ maxWidth: 180 }}>
          {active?.name ?? '—'}
        </span>
      </span>
    );
  }

  return (
    <div className="relative" style={{ display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-transition inline-flex items-center"
        style={{
          gap: 6,
          padding: '4px 8px',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--lp-text)',
          background: open ? 'var(--lp-surface-hover)' : 'transparent',
          border: '1px solid transparent',
          borderRadius: 'var(--lp-radius-sm)',
          cursor: 'pointer',
        }}
      >
        <Building2 size={12} strokeWidth={2.4} style={{ color: 'var(--lp-text-tertiary)' }} />
        <span className="truncate" style={{ maxWidth: 180 }}>
          {active?.name ?? 'Workspace'}
        </span>
        <ChevronDown size={12} strokeWidth={2.4} style={{ color: 'var(--lp-text-tertiary)' }} />
      </button>

      {open ? (
        <div
          ref={panelRef}
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 'var(--lp-z-dropdown)',
            minWidth: 240,
            maxWidth: 320,
            padding: 'var(--lp-space-1)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            boxShadow: 'var(--lp-shadow-popover)',
          }}
        >
          <div
            className="lp-label-caps"
            style={{
              padding: 'var(--lp-space-1) var(--lp-space-2)',
              fontSize: 'var(--lp-text-2xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Your workspaces
          </div>
          {workspaces.map((w) => {
            const isActive = w.is_active;
            const isSwitching = switching === w.id;
            return (
              <button
                key={w.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  if (isActive) {
                    setOpen(false);
                    return;
                  }
                  void handleSwitch(w.id);
                }}
                disabled={isSwitching}
                className="btn-transition flex w-full items-center"
                style={{
                  gap: 'var(--lp-space-2)',
                  padding: 'var(--lp-space-2)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: isActive ? 'var(--lp-surface-hover)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--lp-radius-sm)',
                  cursor: isActive ? 'default' : 'pointer',
                  textAlign: 'left',
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 16,
                    flexShrink: 0,
                    display: 'inline-flex',
                    justifyContent: 'center',
                  }}
                >
                  {isSwitching ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : isActive ? (
                    <Check size={12} strokeWidth={2.4} style={{ color: 'var(--color-lp-orange)' }} />
                  ) : null}
                </span>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="block truncate"
                    style={{ fontWeight: 'var(--lp-weight-medium)' }}
                  >
                    {w.name}
                  </span>
                  <span
                    className="block"
                    style={{
                      fontSize: 'var(--lp-text-xs)',
                      color: 'var(--lp-text-tertiary)',
                    }}
                  >
                    {roleLabel(w.role, w.is_workspace_owner)}
                  </span>
                </span>
              </button>
            );
          })}
          {/* "+ Create workspace" intentionally hidden v1 per Sprint 9 §3 sign-off. */}
        </div>
      ) : null}
    </div>
  );
}
