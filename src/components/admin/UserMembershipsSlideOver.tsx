'use client';

/* ============================================
   LOWPASS — UserMembershipsSlideOver (Sprint 9 §10)

   Site-admin slide-over showing every workspace_members row
   for a target user. Each row has a [Remove from workspace]
   action that DELETEs the membership.

   Mounted from the Users tab's [⋯] action menu → "View
   memberships".
   ============================================ */

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/ui/SlideOver';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { toTitleCase } from '@/lib/text/toTitleCase';

interface MembershipRow {
  membership_id: string;
  workspace_id: string;
  workspace_name: string;
  role: 'admin' | 'manager' | 'readonly';
  is_workspace_owner: boolean;
  joined_at: string;
  tags: string[];
  workspace_archived: boolean;
}

interface UserMembershipsSlideOverProps {
  open: boolean;
  userId: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = Math.floor(diff / 86400000);
  if (day < 1) return 'today';
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function roleLabel(r: MembershipRow['role']): string {
  return r === 'readonly' ? 'Read-only' : r.charAt(0).toUpperCase() + r.slice(1);
}

export function UserMembershipsSlideOver({
  open,
  userId,
  userName,
  userEmail,
  onClose,
}: UserMembershipsSlideOverProps) {
  const { showToast } = useToast();
  const [memberships, setMemberships] = useState<MembershipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<MembershipRow | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/users/${userId}/memberships`,
          { cache: 'no-store' },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) setError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        const body = (await res.json()) as { memberships: MembershipRow[] };
        if (!cancelled) setMemberships(body.memberships);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  async function handleRemove() {
    if (!removeTarget) return;
    const res = await fetch(
      `/api/admin/users/${userId}/memberships/${removeTarget.membership_id}`,
      { method: 'DELETE' },
    );
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok) {
      throw new Error(body?.error ?? `Remove failed (${res.status})`);
    }
    showToast(`Removed from ${removeTarget.workspace_name}.`);
    setMemberships((prev) =>
      prev.filter((m) => m.membership_id !== removeTarget.membership_id),
    );
    setRemoveTarget(null);
  }

  return (
    <>
      <SlideOver
        open={open}
        onClose={onClose}
        title="Memberships"
        width="wide"
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lp-space-4)',
            padding: 'var(--lp-space-4)',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 'var(--lp-text-base)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
              }}
            >
              {toTitleCase(userName) || userEmail}
            </div>
            <div
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              {userEmail}
              {memberships.length > 0
                ? ` · ${memberships.length} workspace${memberships.length === 1 ? '' : 's'}`
                : ''}
            </div>
          </div>

          {loading ? (
            <div
              className="flex items-center"
              style={{
                gap: 'var(--lp-space-2)',
                padding: 'var(--lp-space-3)',
                color: 'var(--lp-text-tertiary)',
                fontSize: 'var(--lp-text-sm)',
              }}
            >
              <Loader2 size={14} className="animate-spin" />
              Loading memberships…
            </div>
          ) : error ? (
            <div
              role="alert"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--color-lp-error)',
                background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              {error}
            </div>
          ) : memberships.length === 0 ? (
            <div
              style={{
                padding: 'var(--lp-space-4)',
                textAlign: 'center',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-tertiary)',
                background: 'var(--lp-panel)',
                border: '1px dashed var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              Not a member of any workspace.
            </div>
          ) : (
            <ul
              style={{
                listStyle: 'none',
                padding: 0,
                margin: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--lp-space-2)',
              }}
            >
              {memberships.map((m) => (
                <li
                  key={m.membership_id}
                  className="flex items-start"
                  style={{
                    gap: 'var(--lp-space-3)',
                    padding: 'var(--lp-space-3) var(--lp-space-4)',
                    background: m.workspace_archived
                      ? 'var(--lp-panel)'
                      : 'var(--lp-surface)',
                    border: '1px solid var(--lp-border-subtle)',
                    borderRadius: 'var(--lp-radius-md)',
                    opacity: m.workspace_archived ? 0.7 : 1,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
                      <strong style={{ color: 'var(--lp-text)' }}>
                        {m.workspace_name}
                      </strong>
                      {m.is_workspace_owner ? (
                        <span
                          className="lp-label-caps"
                          style={{
                            padding: '2px 6px',
                            fontSize: 'var(--lp-text-2xs)',
                            color: 'var(--color-lp-orange)',
                            background:
                              'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                            border:
                              '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
                            borderRadius: 999,
                          }}
                        >
                          Owner
                        </span>
                      ) : null}
                      {m.workspace_archived ? (
                        <span
                          className="lp-label-caps"
                          style={{
                            padding: '2px 6px',
                            fontSize: 'var(--lp-text-2xs)',
                            color: 'var(--lp-text-tertiary)',
                            background: 'var(--lp-bg-tertiary)',
                            border: '1px solid var(--lp-border-subtle)',
                            borderRadius: 999,
                          }}
                        >
                          Archived
                        </span>
                      ) : null}
                    </span>
                    <span
                      className="block"
                      style={{
                        marginTop: 2,
                        fontSize: 'var(--lp-text-xs)',
                        color: 'var(--lp-text-tertiary)',
                      }}
                    >
                      {roleLabel(m.role)} · joined {relativeTime(m.joined_at)}
                      {m.tags.length > 0 ? ` · ${m.tags.join(', ')}` : ''}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(m)}
                    disabled={m.is_workspace_owner}
                    className="btn-transition shrink-0"
                    style={{
                      padding: 'var(--lp-space-1) var(--lp-space-3)',
                      fontSize: 'var(--lp-text-sm)',
                      color: m.is_workspace_owner
                        ? 'var(--lp-text-tertiary)'
                        : 'var(--color-lp-error)',
                      background: 'transparent',
                      border: '1px solid var(--lp-border-strong)',
                      borderRadius: 'var(--lp-radius-md)',
                      cursor: m.is_workspace_owner ? 'not-allowed' : 'pointer',
                    }}
                    title={
                      m.is_workspace_owner
                        ? 'Workspace owner — transfer ownership first'
                        : 'Remove from workspace'
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SlideOver>

      <DeleteConfirmationModal
        open={!!removeTarget}
        itemName={
          removeTarget
            ? `${userName || userEmail} from ${removeTarget.workspace_name}`
            : ''
        }
        description="Removes the user's workspace_members row + their user-direct permission grants. Their personnel record (if any) stays in the workspace."
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
      />
    </>
  );
}
