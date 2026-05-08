'use client';

/* ============================================
   LOWPASS — WorkspacesListClient (Sprint 9 §10)

   Site-admin Workspaces tab. Lists every workspace with
   member + tour counts. [⋯] menu: Rename, Archive (soft-delete).
   "Include archived" toggle.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Loader2, MoreVertical } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

interface WorkspaceRow {
  id: string;
  name: string;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  archived_at: string | null;
  member_count: number;
  tour_count: number;
}

const PAGE_SIZE = 50;

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const day = Math.floor(diff / 86400000);
  if (day < 1) return 'today';
  if (day < 30) return `${day}d ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

export function WorkspacesListClient() {
  const { showToast } = useToast();
  const [rows, setRows] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<WorkspaceRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WorkspaceRow | null>(null);

  const fetchList = useCallback(
    async (replace: boolean) => {
      setError(null);
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (includeArchived) params.set('include_archived', 'true');
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(replace ? 0 : offset));
      try {
        const res = await fetch(`/api/admin/workspaces?${params.toString()}`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          setError(body?.error ?? `Failed to load (${res.status})`);
          return;
        }
        const body = (await res.json()) as { workspaces: WorkspaceRow[] };
        setRows((prev) => (replace ? body.workspaces : [...prev, ...body.workspaces]));
        setHasMore(body.workspaces.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Network error');
      }
    },
    [search, includeArchived, offset],
  );

  useEffect(() => {
    setLoading(true);
    setOffset(0);
    void fetchList(true).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, includeArchived]);

  function loadMore() {
    const next = offset + PAGE_SIZE;
    setOffset(next);
    void fetchList(false);
  }

  async function handleArchive() {
    if (!archiveTarget) return;
    const res = await fetch(`/api/admin/workspaces/${archiveTarget.id}`, {
      method: 'DELETE',
    });
    const body = (await res.json().catch(() => null)) as
      | {
          ok?: boolean;
          archived_at?: string;
          affected_profiles?: number;
          auto_switched?: number;
          error?: string;
        }
      | null;
    if (!res.ok) {
      throw new Error(body?.error ?? `Archive failed (${res.status})`);
    }
    const { affected_profiles = 0, auto_switched = 0 } = body ?? {};
    const orphans = affected_profiles - auto_switched;
    showToast(
      `Archived. ${affected_profiles} profile${affected_profiles === 1 ? '' : 's'} affected; ${auto_switched} auto-switched, ${orphans} orphaned.`,
    );
    if (includeArchived) {
      setRows((prev) =>
        prev.map((r) =>
          r.id === archiveTarget.id
            ? { ...r, archived_at: body?.archived_at ?? new Date().toISOString() }
            : r,
        ),
      );
    } else {
      setRows((prev) => prev.filter((r) => r.id !== archiveTarget.id));
    }
    setArchiveTarget(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Filter row */}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 'var(--lp-space-3)' }}
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workspaces…"
          style={{
            flex: 1,
            minWidth: 240,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />
        <label
          className="inline-flex items-center"
          style={{
            gap: 6,
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            style={{ accentColor: 'var(--color-lp-orange)' }}
          />
          Include archived
        </label>
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
          Loading workspaces…
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
          No workspaces match.
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
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Members</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Tours</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>Created</th>
              <th style={{ padding: 'var(--lp-space-2) var(--lp-space-3)', width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr
                key={w.id}
                style={{
                  borderBottom: '1px solid var(--lp-border-subtle)',
                  color: 'var(--lp-text)',
                  opacity: w.archived_at ? 0.7 : 1,
                }}
              >
                <td style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>
                  <span className="inline-flex items-center" style={{ gap: 6 }}>
                    <span style={{ fontWeight: 'var(--lp-weight-medium)' }}>{w.name}</span>
                    {w.archived_at ? (
                      <span
                        className="lp-label-caps"
                        style={{
                          padding: '1px 6px',
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
                </td>
                <td style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>
                  {w.member_count}
                </td>
                <td style={{ padding: 'var(--lp-space-2) var(--lp-space-3)' }}>
                  {w.tour_count}
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    color: 'var(--lp-text-tertiary)',
                  }}
                >
                  {relativeTime(w.created_at)}
                </td>
                <td
                  style={{
                    padding: 'var(--lp-space-2) var(--lp-space-3)',
                    textAlign: 'right',
                  }}
                >
                  <RowMenu
                    workspace={w}
                    open={menuOpenFor === w.id}
                    onToggle={() =>
                      setMenuOpenFor((prev) => (prev === w.id ? null : w.id))
                    }
                    onClose={() => setMenuOpenFor(null)}
                    onRename={() => {
                      setMenuOpenFor(null);
                      setRenameTarget(w);
                    }}
                    onArchive={() => {
                      setMenuOpenFor(null);
                      setArchiveTarget(w);
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
            onClick={loadMore}
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

      {/* Rename modal — simple inline prompt; no full slide-over needed for one field */}
      {renameTarget ? (
        <RenameModal
          workspace={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={(newName) => {
            setRows((prev) =>
              prev.map((r) =>
                r.id === renameTarget.id ? { ...r, name: newName } : r,
              ),
            );
            setRenameTarget(null);
          }}
        />
      ) : null}

      <DeleteConfirmationModal
        open={!!archiveTarget}
        itemName={archiveTarget ? archiveTarget.name : ''}
        description={`Archives the workspace. ${archiveTarget?.member_count ?? 0} members affected; their active workspace auto-switches to a non-archived one. Data is preserved — site admins can re-list with "Include archived". Type DELETE to confirm.`}
        onClose={() => setArchiveTarget(null)}
        onConfirm={handleArchive}
      />
    </div>
  );
}

interface RowMenuProps {
  workspace: WorkspaceRow;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onRename: () => void;
  onArchive: () => void;
}

function RowMenu({
  workspace,
  open,
  onToggle,
  onClose,
  onRename,
  onArchive,
}: RowMenuProps) {
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
          <MenuItem onClick={onRename}>Rename</MenuItem>
          <div
            style={{
              margin: 'var(--lp-space-1) 0',
              borderTop: '1px solid var(--lp-border-subtle)',
            }}
          />
          <MenuItem
            onClick={onArchive}
            disabled={!!workspace.archived_at}
            destructive
          >
            {workspace.archived_at ? 'Already archived' : 'Archive'}
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

interface RenameModalProps {
  workspace: WorkspaceRow;
  onClose: () => void;
  onSaved: (newName: string) => void;
}

function RenameModal({ workspace, onClose, onSaved }: RenameModalProps) {
  const { showToast } = useToast();
  const [name, setName] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name required.');
      return;
    }
    if (trimmed === workspace.name) {
      onClose();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Workspace renamed.');
      onSaved(trimmed);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{ background: 'color-mix(in srgb, black 55%, transparent)' }}
      onClick={() => !saving && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border shadow-xl animate-scale-in"
        style={{
          background: 'var(--lp-surface)',
          borderColor: 'var(--lp-border-strong)',
          padding: 'var(--lp-space-5)',
        }}
      >
        <h3 className="lp-h3" style={{ margin: 0, color: 'var(--lp-text)' }}>
          Rename workspace
        </h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          style={{
            marginTop: 'var(--lp-space-3)',
            width: '100%',
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />
        {error ? (
          <p
            role="alert"
            style={{
              marginTop: 'var(--lp-space-2)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--color-lp-error)',
            }}
          >
            {error}
          </p>
        ) : null}
        <div className="mt-5 flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="btn-transition"
            style={{
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="btn-transition btn-primary-press inline-flex items-center"
            style={{
              gap: 6,
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-inverse)',
              background: 'var(--color-lp-orange)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
