'use client';

/* ============================================
   LOWPASS — MembersListClient (Sprint 9 §3)

   Client surface for /settings/members. Loads members + pending
   invites via /api/workspaces/members and renders:
     - Counts strip (admins / managers / readonly).
     - Filter row (status / role / tag / search).
     - List of <MemberCard> rows.
     - "Pending" subhead + <PendingInviteCard> rows at the bottom.
     - <MemberManageSlideOver> + <InviteMemberSlideOver> mounts.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { MemberManageSlideOver } from './MemberManageSlideOver';
import { InviteMemberSlideOver } from './InviteMemberSlideOver';
import type {
  Member,
  PendingInvite,
  WorkspaceMembersPayload,
  WorkspaceRole,
} from '@/lib/permissions/types';

interface MembersListClientProps {
  currentUserId: string;
}

type RoleFilter = 'all' | WorkspaceRole;
type StatusFilter = 'all' | 'active' | 'pending';

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (h < 24) return `${h}h ago`;
  if (day < 30) return `${day}d ago`;
  return d.toLocaleDateString();
}

function expiresInDays(iso: string): number {
  const d = new Date(iso);
  const ms = d.getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function initials(name: string | null, email: string | null): string {
  const src = (name?.trim() || email?.trim() || '?').toUpperCase();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length >= 2) return parts[0][0]! + parts[1][0]!;
  return parts[0]?.slice(0, 2) ?? '?';
}

function roleLabel(r: WorkspaceRole): string {
  if (r === 'readonly') return 'Read-only';
  return r.charAt(0).toUpperCase() + r.slice(1);
}

export function MembersListClient({ currentUserId }: MembersListClientProps) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [manageMember, setManageMember] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/workspaces/members', { cache: 'no-store' });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? `Failed to load (${res.status})`);
        return;
      }
      const body = (await res.json()) as WorkspaceMembersPayload;
      setMembers(body.members);
      setInvites(body.invites);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    }
  }, []);

  useEffect(() => {
    // Initial state is `loading: true` — don't re-set it here
    // (react-hooks/set-state-in-effect). The cancelled flag
    // guards against unmount during the fetch. The lint rule
    // flags fetchData() because it transitively setStates;
    // disable here — fetch-on-mount is the canonical effect
    // use case and the rule is overly aggressive for it.
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchData().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }

  // Derived data: known tags + suggested tags + counts.
  const knownTags = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) for (const t of m.tags) set.add(t);
    for (const i of invites) for (const t of i.initial_tags) set.add(t);
    return Array.from(set).sort();
  }, [members, invites]);

  const suggestedTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      for (const t of m.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);
  }, [members]);

  const counts = useMemo(() => {
    let admin = 0,
      manager = 0,
      readonly = 0;
    for (const m of members) {
      if (m.role === 'admin') admin++;
      else if (m.role === 'manager') manager++;
      else if (m.role === 'readonly') readonly++;
    }
    return { admin, manager, readonly };
  }, [members]);

  const existingEmails = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      if (m.email) set.add(m.email.toLowerCase());
    }
    for (const i of invites) {
      set.add(i.invited_email.toLowerCase());
    }
    return set;
  }, [members, invites]);

  const filteredMembers = useMemo(() => {
    if (statusFilter === 'pending') return [];
    const q = search.trim().toLowerCase();
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false;
      if (tagFilter !== 'all' && !m.tags.includes(tagFilter)) return false;
      if (!q) return true;
      const hay = `${m.display_name ?? ''} ${m.email ?? ''} ${m.tags.join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }, [members, search, roleFilter, statusFilter, tagFilter]);

  const filteredInvites = useMemo(() => {
    if (statusFilter === 'active') return [];
    const q = search.trim().toLowerCase();
    return invites.filter((i) => {
      if (roleFilter !== 'all' && i.invited_role !== roleFilter) return false;
      if (tagFilter !== 'all' && !i.initial_tags.includes(tagFilter)) return false;
      if (!q) return true;
      return i.invited_email.toLowerCase().includes(q);
    });
  }, [invites, search, roleFilter, statusFilter, tagFilter]);

  if (loading) {
    return (
      <div
        className="flex items-center"
        style={{
          gap: 'var(--lp-space-2)',
          padding: 'var(--lp-space-6)',
          color: 'var(--lp-text-tertiary)',
        }}
      >
        <Loader2 size={14} className="animate-spin" />
        Loading members…
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        style={{
          padding: 'var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--color-lp-error)',
          background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
          border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)',
          borderRadius: 'var(--lp-radius-md)',
        }}
      >
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      {/* Counts + invite */}
      <div className="flex items-center justify-between" style={{ gap: 'var(--lp-space-3)' }}>
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {counts.admin} admin{counts.admin === 1 ? '' : 's'} · {counts.manager} manager
          {counts.manager === 1 ? '' : 's'} · {counts.readonly} read-only
          {invites.length > 0 ? ` · ${invites.length} pending` : ''}
        </div>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          <button
            type="button"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            className="btn-transition inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              color: 'var(--lp-text-secondary)',
              background: 'transparent',
              border: '1px solid var(--lp-border-strong)',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            <RefreshCw
              size={14}
              strokeWidth={2.4}
              className={refreshing ? 'animate-spin' : ''}
            />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="btn-transition btn-primary-press inline-flex items-center"
            style={{
              gap: 4,
              padding: 'var(--lp-space-2) var(--lp-space-3)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-inverse)',
              background: 'var(--color-lp-orange)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
            }}
          >
            <Plus size={14} strokeWidth={2.4} />
            Invite member
          </button>
        </div>
      </div>

      {/* Filters */}
      <div
        className="flex flex-wrap items-center"
        style={{ gap: 'var(--lp-space-2)' }}
      >
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'pending', label: 'Pending' },
          ]}
        />
        <FilterSelect
          label="Role"
          value={roleFilter}
          onChange={(v) => setRoleFilter(v as RoleFilter)}
          options={[
            { value: 'all', label: 'Any' },
            { value: 'admin', label: 'Admin' },
            { value: 'manager', label: 'Manager' },
            { value: 'readonly', label: 'Read-only' },
          ]}
        />
        <FilterSelect
          label="Tag"
          value={tagFilter}
          onChange={setTagFilter}
          options={[
            { value: 'all', label: 'Any' },
            ...knownTags.map((t) => ({ value: t, label: t })),
          ]}
        />
        <input
          type="text"
          placeholder="Search by name, email, or tag…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            minWidth: 200,
            padding: 'var(--lp-space-2) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'var(--lp-bg)',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            outline: 'none',
          }}
        />
      </div>

      {/* Active members */}
      {filteredMembers.length === 0 && filteredInvites.length === 0 ? (
        <div
          style={{
            padding: 'var(--lp-space-6)',
            textAlign: 'center',
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-sm)',
            background: 'var(--lp-panel)',
            border: '1px dashed var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
          }}
        >
          No members match your filters.
        </div>
      ) : null}

      {filteredMembers.length > 0 ? (
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
          {filteredMembers.map((m) => (
            <li key={m.member_id}>
              <MemberCard
                member={m}
                isCallerSelf={m.user_id === currentUserId}
                onManage={() => setManageMember(m)}
              />
            </li>
          ))}
        </ul>
      ) : null}

      {/* Pending invites */}
      {filteredInvites.length > 0 ? (
        <>
          <div
            className="lp-label-caps"
            style={{
              marginTop: 'var(--lp-space-3)',
              fontSize: 'var(--lp-text-2xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Pending · {filteredInvites.length}
          </div>
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
            {filteredInvites.map((i) => (
              <li key={i.id}>
                <PendingInviteCard
                  invite={i}
                  onChanged={() => void fetchData()}
                  onToast={showToast}
                />
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {/* Slide-overs */}
      <MemberManageSlideOver
        open={!!manageMember}
        member={manageMember}
        knownTags={knownTags}
        suggestedTags={suggestedTags}
        isCallerSelf={manageMember?.user_id === currentUserId}
        onClose={() => setManageMember(null)}
        onSaved={() => void fetchData()}
        onRemoved={() => void fetchData()}
      />
      <InviteMemberSlideOver
        open={inviteOpen}
        knownTags={knownTags}
        suggestedTags={suggestedTags}
        existingEmails={existingEmails}
        onClose={() => setInviteOpen(false)}
        onInvited={() => void fetchData()}
      />
    </div>
  );
}

interface MemberCardProps {
  member: Member;
  isCallerSelf: boolean;
  onManage: () => void;
}

function MemberCard({ member, isCallerSelf, onManage }: MemberCardProps) {
  const grantSummary = useMemo(() => {
    if (member.role !== 'readonly') return null;
    if (member.grants.length === 0) return 'No granted resources.';
    const labels = member.grants.map(
      (g) => `${g.resource_id}${g.permission === 'write' ? ' (read+write)' : ''}`,
    );
    return `Granted: ${Array.from(new Set(labels)).slice(0, 4).join(', ')}${labels.length > 4 ? ` +${labels.length - 4} more` : ''}`;
  }, [member.role, member.grants]);

  return (
    <article
      className="flex items-start"
      style={{
        gap: 'var(--lp-space-3)',
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        background: 'var(--lp-surface)',
        border: '1px solid var(--lp-border-subtle)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <div
        aria-hidden
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: 'var(--lp-panel)',
          color: 'var(--lp-text-secondary)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-semibold)',
          textTransform: 'uppercase',
        }}
      >
        {initials(member.display_name, member.email)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
          <span
            style={{
              fontSize: 'var(--lp-text-base)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text)',
            }}
          >
            {member.display_name?.trim() || member.email || 'Unnamed'}
          </span>
          {isCallerSelf ? (
            <span
              style={{
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              (you)
            </span>
          ) : null}
          {member.is_workspace_owner ? (
            <span
              className="lp-label-caps"
              style={{
                padding: '2px 6px',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--color-lp-orange)',
                background: 'color-mix(in srgb, var(--color-lp-orange) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
                borderRadius: 999,
              }}
            >
              Owner
            </span>
          ) : null}
        </div>
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text-secondary)',
          }}
        >
          {member.email ?? '—'}
        </div>
        <div
          className="flex flex-wrap items-center"
          style={{
            marginTop: 4,
            gap: 'var(--lp-space-2)',
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          <span>{roleLabel(member.role)}</span>
          {member.tags.length > 0 ? (
            <span>· Tags: {member.tags.join(', ')}</span>
          ) : null}
          <span>· Last seen {relativeTime(member.last_sign_in_at)}</span>
        </div>
        {grantSummary ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            {grantSummary}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onManage}
        className="btn-transition shrink-0"
        style={{
          padding: 'var(--lp-space-1) var(--lp-space-3)',
          fontSize: 'var(--lp-text-sm)',
          fontWeight: 'var(--lp-weight-medium)',
          color: 'var(--lp-text)',
          background: 'transparent',
          border: '1px solid var(--lp-border-strong)',
          borderRadius: 'var(--lp-radius-md)',
          cursor: 'pointer',
        }}
      >
        Manage ▸
      </button>
    </article>
  );
}

interface PendingInviteCardProps {
  invite: PendingInvite;
  onChanged: () => void;
  onToast: (msg: string) => void;
}

function PendingInviteCard({ invite, onChanged, onToast }: PendingInviteCardProps) {
  const [busy, setBusy] = useState<'resend' | 'revoke' | null>(null);

  async function handleResend() {
    setBusy('resend');
    try {
      const res = await fetch(`/api/workspaces/invite/${invite.id}/resend`, {
        method: 'POST',
      });
      if (res.ok) {
        onToast('Invite resent — previous link invalidated.');
        onChanged();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        onToast(body?.error ?? `Resend failed (${res.status})`);
      }
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke() {
    setBusy('revoke');
    try {
      const res = await fetch(`/api/workspaces/invite/${invite.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onToast('Invite revoked.');
        onChanged();
      } else {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        onToast(body?.error ?? `Revoke failed (${res.status})`);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <article
      className="flex items-start"
      style={{
        gap: 'var(--lp-space-3)',
        padding: 'var(--lp-space-3) var(--lp-space-4)',
        background: 'color-mix(in srgb, var(--color-lp-orange) 4%, transparent)',
        border: '1px dashed color-mix(in srgb, var(--color-lp-orange) 35%, transparent)',
        borderRadius: 'var(--lp-radius-md)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--lp-text-base)',
            fontWeight: 'var(--lp-weight-semibold)',
            color: 'var(--lp-text)',
          }}
        >
          Pending: {invite.invited_email}
        </div>
        <div
          style={{
            marginTop: 2,
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
          }}
        >
          {roleLabel(invite.invited_role)}
          {invite.invited_by_name ? ` · invited ${relativeTime(invite.created_at)} by ${invite.invited_by_name}` : ` · invited ${relativeTime(invite.created_at)}`}
          {' · '}
          Expires in {expiresInDays(invite.expires_at)}d
        </div>
        {invite.initial_tags.length > 0 ? (
          <div
            style={{
              marginTop: 4,
              fontSize: 'var(--lp-text-xs)',
              color: 'var(--lp-text-tertiary)',
            }}
          >
            Tags on accept: {invite.initial_tags.join(', ')}
          </div>
        ) : null}
        <div
          style={{
            marginTop: 4,
            fontSize: 'var(--lp-text-xs)',
            color: 'var(--lp-text-tertiary)',
            fontStyle: 'italic',
          }}
        >
          Resending invalidates the previous invite link.
        </div>
      </div>
      <div className="shrink-0 flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={busy !== null}
          className="btn-transition"
          style={{
            padding: 'var(--lp-space-1) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            opacity: busy === 'resend' ? 0.6 : 1,
          }}
        >
          {busy === 'resend' ? 'Resending…' : 'Resend'}
        </button>
        <button
          type="button"
          onClick={() => void handleRevoke()}
          disabled={busy !== null}
          className="btn-transition"
          style={{
            padding: 'var(--lp-space-1) var(--lp-space-3)',
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--color-lp-error)',
            background: 'transparent',
            border: '1px solid var(--lp-border-strong)',
            borderRadius: 'var(--lp-radius-md)',
            cursor: busy !== null ? 'not-allowed' : 'pointer',
            opacity: busy === 'revoke' ? 0.6 : 1,
          }}
        >
          {busy === 'revoke' ? 'Revoking…' : 'Revoke'}
        </button>
      </div>
    </article>
  );
}

interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
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
