'use client';

/* ============================================
   LOWPASS — MemberManageSlideOver (Sprint 9 §3)

   Per-member admin Manage slide-over: role radio + tag editor +
   permission matrix + sensitive-grants warning + remove. Saves
   via PATCH /api/workspaces/members/[id], which calls the
   update_workspace_member RPC for atomic role+tags+grants.
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { TagEditor } from './TagEditor';
import { PermissionMatrix } from './PermissionMatrix';
import { RESOURCE_BY_ID } from '@/lib/permissions/resources';
import type {
  GrantInput,
  Member,
  WorkspaceRole,
} from '@/lib/permissions/types';

interface MemberManageSlideOverProps {
  open: boolean;
  member: Member | null;
  knownTags: string[];
  suggestedTags: string[];
  isCallerSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}

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

export function MemberManageSlideOver({
  open,
  member,
  knownTags,
  suggestedTags,
  isCallerSelf,
  onClose,
  onSaved,
  onRemoved,
}: MemberManageSlideOverProps) {
  const { showToast } = useToast();
  const [role, setRole] = useState<WorkspaceRole>('readonly');
  const [tags, setTags] = useState<string[]>([]);
  const [grants, setGrants] = useState<GrantInput[]>([]);
  const [sensitiveSelected, setSensitiveSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the member prop changes / slide-over opens.
  const memberKey = member?.member_id ?? null;
  const lastKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open || !member) return;
    if (lastKey.current === memberKey) return;
    lastKey.current = memberKey;
    setRole(member.role);
    setTags(member.tags);
    setGrants(member.grants);
    setError(null);
    setConfirmOpen(false);
    setRemoveConfirm(false);
  }, [open, member, memberKey]);

  const matrixDisabled = role !== 'readonly';

  const sensitiveLabels = useMemo(
    () =>
      sensitiveSelected
        .map((id) => RESOURCE_BY_ID.get(id)?.label ?? id)
        .sort(),
    [sensitiveSelected],
  );

  async function commitSave() {
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      // For non-readonly roles, persist an empty grants array —
      // role check inside can_access() handles access.
      const payload = {
        role,
        tags,
        grants: role === 'readonly' ? grants : [],
      };
      const res = await fetch(`/api/workspaces/members/${member.member_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Save failed (${res.status})`);
        return;
      }
      showToast('Member updated.');
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  function handleSaveClick() {
    if (role === 'readonly' && sensitiveSelected.length > 0) {
      setConfirmOpen(true);
      return;
    }
    void commitSave();
  }

  async function handleRemove() {
    if (!member) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/members/${member.member_id}`, {
        method: 'DELETE',
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok) {
        setError(body?.error ?? `Remove failed (${res.status})`);
        return;
      }
      showToast('Member removed.');
      onRemoved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
      setRemoveConfirm(false);
    }
  }

  if (!member) return null;

  const cannotRemove = isCallerSelf || member.is_workspace_owner;

  return (
    <>
      <SlideOver open={open} onClose={onClose} title="Manage member" width="wide">
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--lp-space-4)',
            padding: 'var(--lp-space-4)',
          }}
        >
          {/* Header */}
          <div>
            <div
              style={{
                fontSize: 'var(--lp-text-base)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
              }}
            >
              {member.display_name?.trim() || member.email || 'Unnamed member'}
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
              style={{
                marginTop: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Joined {relativeTime(member.joined_at)} · Last seen {relativeTime(member.last_sign_in_at)}
              {member.is_workspace_owner ? ' · Owner' : ''}
            </div>
          </div>

          {/* Role */}
          <fieldset
            style={{ border: 'none', padding: 0, margin: 0 }}
            disabled={member.is_workspace_owner}
          >
            <legend
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                marginBottom: 'var(--lp-space-2)',
              }}
            >
              Role
            </legend>
            <div className="flex flex-wrap" style={{ gap: 'var(--lp-space-3)' }}>
              {(['admin', 'manager', 'readonly'] as const).map((r) => (
                <label
                  key={r}
                  className="inline-flex items-center"
                  style={{
                    gap: 6,
                    fontSize: 'var(--lp-text-sm)',
                    color: 'var(--lp-text)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r}
                    checked={role === r}
                    onChange={() => setRole(r)}
                    style={{ accentColor: 'var(--color-lp-orange)' }}
                  />
                  <span style={{ textTransform: 'capitalize' }}>
                    {r === 'readonly' ? 'Read-only' : r}
                  </span>
                </label>
              ))}
            </div>
            <div
              style={{
                marginTop: 'var(--lp-space-1)',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Admin: full access including members. Manager: full data access except members + billing. Read-only: only what tags / permissions allow.
            </div>
            {member.is_workspace_owner ? (
              <div
                style={{
                  marginTop: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                  fontStyle: 'italic',
                }}
              >
                Workspace owner is always admin and cannot be demoted or removed.
              </div>
            ) : null}
          </fieldset>

          {/* Tags */}
          <div>
            <div
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                marginBottom: 'var(--lp-space-2)',
              }}
            >
              Tags
            </div>
            <TagEditor
              value={tags}
              onChange={setTags}
              knownTags={knownTags}
              suggestedTags={suggestedTags}
            />
          </div>

          {/* Permissions */}
          <div>
            <div
              className="lp-label-caps"
              style={{
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-secondary)',
                marginBottom: 'var(--lp-space-1)',
              }}
            >
              Permissions
            </div>
            <div
              style={{
                marginBottom: 'var(--lp-space-2)',
                fontSize: 'var(--lp-text-xs)',
                color: 'var(--lp-text-tertiary)',
              }}
            >
              Read-only users see ONLY what&apos;s checked here. Admin/manager have implicit access to everything.
            </div>
            <PermissionMatrix
              value={grants}
              onChange={setGrants}
              disabled={matrixDisabled}
              onSensitiveGrantsChange={setSensitiveSelected}
            />
          </div>

          {/* Sensitive grants warning */}
          {role === 'readonly' && sensitiveSelected.length > 0 ? (
            <div
              style={{
                padding: 'var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text)',
                background: 'color-mix(in srgb, var(--color-lp-orange) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-lp-orange) 30%, transparent)',
                borderRadius: 'var(--lp-radius-md)',
              }}
            >
              <div
                className="lp-label-caps"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--color-lp-orange)',
                  marginBottom: 'var(--lp-space-1)',
                }}
              >
                ⚠ Sensitive grants
              </div>
              This member will see:
              <ul style={{ marginTop: 4, marginLeft: 18, lineHeight: 1.6 }}>
                {sensitiveLabels.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <div
                style={{
                  marginTop: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                You&apos;ll be asked to confirm on Save.
              </div>
            </div>
          ) : null}

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

          {/* Footer */}
          <div
            className="flex items-center justify-between"
            style={{ gap: 'var(--lp-space-2)' }}
          >
            <button
              type="button"
              onClick={() => setRemoveConfirm(true)}
              disabled={saving || cannotRemove}
              className="btn-transition"
              style={{
                padding: 'var(--lp-space-2) var(--lp-space-3)',
                fontSize: 'var(--lp-text-sm)',
                fontWeight: 'var(--lp-weight-medium)',
                color: cannotRemove ? 'var(--lp-text-tertiary)' : 'var(--color-lp-error)',
                background: 'transparent',
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                cursor: cannotRemove ? 'not-allowed' : 'pointer',
                opacity: cannotRemove ? 0.55 : 1,
              }}
              title={
                isCallerSelf
                  ? "You can't remove yourself."
                  : member.is_workspace_owner
                    ? "Owner can't be removed."
                    : 'Remove member from workspace'
              }
            >
              Remove member
            </button>
            <div className="flex items-center" style={{ gap: 'var(--lp-space-2)' }}>
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
                onClick={handleSaveClick}
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
      </SlideOver>

      {/* Sensitive-grants confirmation modal */}
      {confirmOpen ? (
        <ConfirmModal
          title="Grant sensitive access?"
          body={
            <>
              <p style={{ margin: 0 }}>
                You&apos;re granting this member access to sensitive data:
              </p>
              <ul style={{ marginTop: 6, marginLeft: 18, lineHeight: 1.6 }}>
                {sensitiveLabels.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p style={{ marginTop: 8 }}>
                They&apos;ll see amounts, files, and rates. Continue?
              </p>
            </>
          }
          confirmLabel="Grant access"
          confirmDestructive
          busy={saving}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => void commitSave()}
        />
      ) : null}

      {/* Remove confirmation modal */}
      {removeConfirm ? (
        <ConfirmModal
          title="Remove member?"
          body={
            <p style={{ margin: 0 }}>
              Removes <strong>{member.display_name?.trim() || member.email}</strong> from
              this workspace. Their grants and tags will be revoked. They will lose access immediately.
            </p>
          }
          confirmLabel="Remove"
          confirmDestructive
          busy={saving}
          onCancel={() => setRemoveConfirm(false)}
          onConfirm={() => void handleRemove()}
        />
      ) : null}
    </>
  );
}

interface ConfirmModalProps {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  confirmDestructive?: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  confirmDestructive = false,
  busy,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[3000] flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in srgb, black 55%, transparent)',
      }}
      onClick={() => !busy && onCancel()}
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
        <div
          className="flex items-center justify-between"
          style={{ marginBottom: 'var(--lp-space-3)' }}
        >
          <h3
            className="lp-h3"
            style={{ margin: 0, color: 'var(--lp-text)' }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            style={{
              padding: 4,
              border: 'none',
              background: 'transparent',
              color: 'var(--lp-text-tertiary)',
              cursor: busy ? 'not-allowed' : 'pointer',
            }}
          >
            <X size={16} strokeWidth={2.4} />
          </button>
        </div>
        <div
          style={{
            fontSize: 'var(--lp-text-sm)',
            color: 'var(--lp-text)',
            lineHeight: 1.5,
          }}
        >
          {body}
        </div>
        <div
          className="mt-5 flex justify-end"
          style={{ gap: 'var(--lp-space-2)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
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
            onClick={onConfirm}
            disabled={busy}
            className="btn-transition btn-primary-press inline-flex items-center"
            style={{
              gap: 6,
              padding: 'var(--lp-space-2) var(--lp-space-4)',
              fontSize: 'var(--lp-text-sm)',
              fontWeight: 'var(--lp-weight-semibold)',
              color: 'var(--lp-text-inverse)',
              background: confirmDestructive
                ? 'var(--color-lp-error)'
                : 'var(--color-lp-orange)',
              border: '1px solid transparent',
              borderRadius: 'var(--lp-radius-md)',
              cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
