'use client';

/* ============================================
   LOWPASS — UsersListClient (Sprint 9 §10)

   Admin Users tab. Search + status filter + paginated user
   table. Each row has a [⋯] menu: View memberships, Reset
   password, Suspend/Reactivate, Delete user.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MoreVertical, Search } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';
import { toTitleCase } from '@/lib/text/toTitleCase';
import { UserMembershipsSlideOver } from './UserMembershipsSlideOver';

interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  is_site_admin: boolean;
  is_suspended: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  workspace_count: number;
}

type StatusFilter = 'all' | 'active' | 'suspended';

const PAGE_SIZE = 50;

function relativeTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = Math.floor(diff / 86400000);
  if (day < 1) return 'today';
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

interface UsersListClientProps {
  currentUserId: string;
}

export function UsersListClient({ currentUserId }: UsersListClientProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [membershipsTarget, setMembershipsTarget] = useState<UserRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserRow | null>(null);

  const fetchUsers = useCallback(
    async (replace: boolean) => {
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      params.set('status', status);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(replace ? 0 : offset));
      try {
        const res = await fetch(`/api/admin/users?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        const body = (await res.json()) as { users: UserRow[] };
        setRows((prev) => (replace ? body.users : [...prev, ...body.users]));
        setHasMore(body.users.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    },
    [search, status, offset],
  );

  // Initial + filter changes — replace.
  useEffect(() => {
    setLoading(true);
    setOffset(0);
    void fetchUsers(true).finally(() => setLoading(false));
    // We intentionally don't include offset here — that's
    // pagination state, handled by the loadMore branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status]);

  function handleLoadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void fetchUsers(false);
  }

  async function handleResetPassword(u: UserRow) {
    if (!u.email) {
      showToast('User has no email on file.');
      return;
    }
    const res = await fetch(`/api/admin/users/${u.id}/reset-password`, {
      method: 'POST',
    });
    if (res.ok) {
      showToast(`Password recovery sent to ${u.email}.`);
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      showToast(body?.error ?? 'Could not send recovery email.');
    }
  }

  async function handleToggleSuspend(u: UserRow) {
    const res = await fetch(`/api/admin/users/${u.id}/suspend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspend: !u.is_suspended }),
    });
    if (res.ok) {
      showToast(u.is_suspended ? 'User reactivated.' : 'User suspended.');
      // Optimistically flip the flag; refetch to be canonical.
      setRows((prev) =>
        prev.map((r) => (r.id === u.id ? { ...r, is_suspended: !r.is_suspended } : r)),
      );
    } else {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      showToast(body?.error ?? 'Could not toggle suspension.');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const res = await fetch(`/api/admin/users/${deleteTarget.id}`, {
      method: 'DELETE',
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string }
      | null;
    if (!res.ok) {
      throw new Error(body?.error ?? `Delete failed (${res.status})`);
    }
    showToast('User deleted.');
    setRows((prev) => prev.filter((r) => r.id !== deleteTarget.id));
    setDeleteTarget(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Filter row */}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 'var(--lp-space-2)' }}
      >
        <div
          className="flex items-center"
          style={{
            gap: 6,
            flex: 1,
            minWidth: 240,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          <Search
            size={14}
            strokeWidth={2.4}
            style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
              background: 'transparent',
              border: 'none',
              outline: 'none',
            }}
          />
        </div>
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => setStatus(v as StatusFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'suspended', label: 'Suspended' },
          ]}
        />
      </div>

      {error ? (
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
      ) : null}

      {loading ? (
        <div
          className="flex items-center"
          style={{
            gap: 'var(--lp-space-2)',
            padding: 'var(--lp-space-6)',
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          <Loader2 size={14} className="animate-spin" />
          Loading users…
        </div>
      ) : rows.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-tertiary)',
            background: 'var(--lp-panel)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          No users match.
        </div>
      ) : (
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 'var(--lp-text-sm)',
          }}
        >
          <thead>
            <tr
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-tertiary)',
                textAlign: 'left',
                background: 'var(--lp-panel)',
              }}
            >
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Name</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Email</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Workspaces</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Last sign-in</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)', width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr
                key={u.id}
                style={{
                  borderBottom: '1px solid var(--lp-border-subtle)',
                  color: 'var(--lp-text)',
                }}
              >
                <td style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>
                  <span className="inline-flex items-center" style={{ gap: 6 }}>
                    {u.is_suspended ? (
                      <span
                        aria-label="Suspended"
                        style={{
                          color: 'var(--lp-text-tertiary)',
                          flexShrink: 0,
                        }}
                      >
                        ⊘
                      </span>
                    ) : null}
                    <span style={{ fontWeight: 'var(--lp-weight-medium)' }}>
                      {u.name ? toTitleCase(u.name) : '—'}
                    </span>
                    {u.is_site_admin ? (
                      <span
                        className="lp-label-caps"
                        style={{
                          padding: '1px 6px',
                          fontSize: 'var(--lp-text-2xs)',
                          color: 'var(--lp-text)',
                          background: 'var(--lp-bg-tertiary)',
                          border: '1px solid var(--lp-border-subtle)',
                          borderRadius: 999,
                        }}
                      >
                        Admin
                      </span>
                    ) : null}
                  </span>
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {u.email ?? '—'}
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    color: 'var(--lp-text-secondary)',
                  }}
                >
                  {u.workspace_count}
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {relativeTime(u.last_sign_in_at)}
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    textAlign: 'right',
                  }}
                >
                  <RowMenu
                    isCurrent={u.id === currentUserId}
                    user={u}
                    open={menuOpenFor === u.id}
                    onToggle={() =>
                      setMenuOpenFor((prev) => (prev === u.id ? null : u.id))
                    }
                    onClose={() => setMenuOpenFor(null)}
                    onViewMemberships={() => {
                      setMenuOpenFor(null);
                      setMembershipsTarget(u);
                    }}
                    onResetPassword={() => {
                      setMenuOpenFor(null);
                      void handleResetPassword(u);
                    }}
                    onToggleSuspend={() => {
                      setMenuOpenFor(null);
                      void handleToggleSuspend(u);
                    }}
                    onDelete={() => {
                      setMenuOpenFor(null);
                      setDeleteTarget(u);
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {hasMore && !loading ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={handleLoadMore}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            Load more
          </button>
        </div>
      ) : null}

      {membershipsTarget ? (
        <UserMembershipsSlideOver
          open
          userId={membershipsTarget.id}
          userName={membershipsTarget.name ?? ''}
          userEmail={membershipsTarget.email ?? ''}
          onClose={() => setMembershipsTarget(null)}
        />
      ) : null}

      <DeleteConfirmationModal
        open={!!deleteTarget}
        itemName={
          deleteTarget
            ? deleteTarget.email ?? deleteTarget.name ?? deleteTarget.id
            : ''
        }
        description="Deletes the user's auth record and cascades to all workspace memberships, permission grants, and profile data. Personnel records and historical audit log entries are preserved."
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

interface RowMenuProps {
  isCurrent: boolean;
  user: UserRow;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onViewMemberships: () => void;
  onResetPassword: () => void;
  onToggleSuspend: () => void;
  onDelete: () => void;
}

function RowMenu({
  isCurrent,
  user,
  open,
  onToggle,
  onClose,
  onViewMemberships,
  onResetPassword,
  onToggleSuspend,
  onDelete,
}: RowMenuProps) {
  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = () => onClose();
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onClose]);

  return (
    <div
      className="relative"
      style={{ display: 'inline-block' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="btn-transition flex items-center justify-center"
        style={{
          width: 28,
          height: 28,
          color: 'var(--lp-text-secondary)',
          background: open ? 'var(--lp-surface-hover)' : 'transparent',
          border: '1px solid transparent',
          borderRadius: 'var(--lp-radius-sm)',
          cursor: 'pointer',
        }}
      >
        <MoreVertical size={14} strokeWidth={2.4} />
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            zIndex: 'var(--lp-z-dropdown)',
            minWidth: 200,
            padding: 'var(--lp-space-1)',
            background: 'var(--lp-panel)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            boxShadow: 'var(--lp-shadow-popover)',
          }}
        >
          <MenuItem onClick={onViewMemberships}>View memberships</MenuItem>
          <MenuItem onClick={onResetPassword} disabled={!user.email}>
            Reset password
          </MenuItem>
          <MenuItem
            onClick={onToggleSuspend}
            disabled={isCurrent}
            destructive={!user.is_suspended}
          >
            {user.is_suspended ? 'Reactivate' : 'Suspend'}
          </MenuItem>
          <div
            style={{
              margin: 'var(--lp-space-1) 0',
              borderTop: '1px solid var(--lp-border-subtle)',
            }}
          />
          <MenuItem
            onClick={onDelete}
            disabled={isCurrent}
            destructive
          >
            Delete user
          </MenuItem>
        </div>
      ) : null}
    </div>
  );
}

interface MenuItemProps {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}

function MenuItem({ children, onClick, disabled, destructive }: MenuItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="btn-transition"
      style={{
        display: 'block',
        width: '100%',
        padding: 'var(--lp-space-2) var(--lp-space-3)',
        fontSize: 'var(--lp-text-sm)',
        textAlign: 'left',
        color: disabled
          ? 'var(--lp-text-tertiary)'
          : destructive
            ? 'var(--color-lp-error)'
            : 'var(--lp-text)',
        background: 'transparent',
        border: 'none',
        borderRadius: 'var(--lp-radius-sm)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
}

function FilterSelect({ label, value, onChange, options }: FilterSelectProps) {
  return (
    <label
      className="inline-flex items-center"
      style={{
        gap: 6,
        fontSize: 'var(--lp-text-xs)',
        color: 'var(--lp-text-tertiary)',
      }}
    >
      <span>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          padding: '2px 8px',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
          background: 'var(--lp-bg)',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-sm)',
          cursor: 'pointer',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
