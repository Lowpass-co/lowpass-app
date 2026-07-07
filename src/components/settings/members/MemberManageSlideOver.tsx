'use client';

/* ============================================
   LOWPASS — MemberManageSlideOver (Sprint 9 §3,
   Sprint 11 §4 auto-save adoption)

   Per-member admin Manage slide-over: role radio + tag editor +
   permission matrix + sensitive-grants warning + remove. Saves
   via PATCH /api/workspaces/members/[id], which calls the
   update_workspace_member RPC for atomic role+tags+grants.

   Sprint 11 §4 — adopts useAutoSave: state lives in the hook
   (snapshot at open time), each role/tag/grant change debounces
   a PATCH. The Save button is removed; the SaveStatus pill +
   Cancel-restores-snapshot replace it.

   Sensitive-grants policy: the Sprint 9 design used a
   confirm-on-Save modal. With auto-save the modal is dropped —
   the visible "⚠ Sensitive grants" warning panel already shows
   the consequence the moment a sensitive grant is toggled, and
   Cancel reverts the open-time snapshot via one final PATCH.
   The visible+revertable pair is the safety gate.
   ============================================ */

import { useMemo, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { SlideOver } from '@/components/shell/SlideOver';
import { TagEditor } from './TagEditor';
import { PermissionMatrix } from './PermissionMatrix';
import { RESOURCE_BY_ID } from '@/lib/permissions/resources';
import { useAutoSave } from '@/lib/forms/useAutoSave';
import { SaveStatus } from '@/components/forms/SaveStatus';
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

interface EditState {
  role: WorkspaceRole;
  tags: string[];
  grants: GrantInput[];
}

function memberToState(m: Member): EditState {
  return {
    role: m.role,
    tags: m.tags,
    grants: m.grants,
  };
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
  if (!member) return null;
  return (
    <MemberManageEditor
      key={`${member.member_id}:${open ? 'open' : 'closed'}`}
      open={open}
      member={member}
      knownTags={knownTags}
      suggestedTags={suggestedTags}
      isCallerSelf={isCallerSelf}
      onClose={onClose}
      onSaved={onSaved}
      onRemoved={onRemoved}
    />
  );
}

interface EditorProps {
  open: boolean;
  member: Member;
  knownTags: string[];
  suggestedTags: string[];
  isCallerSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
  onRemoved: () => void;
}

function MemberManageEditor({
  open,
  member,
  knownTags,
  suggestedTags,
  isCallerSelf,
  onClose,
  onSaved,
  onRemoved,
}: EditorProps) {
  const { showToast } = useToast();
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [sensitiveSelected, setSensitiveSelected] = useState<string[]>([]);

  const {
    state,
    set,
    status,
    lastSavedAt,
    errorMessage,
    cancel,
    flushSave,
  } = useAutoSave<EditState>({
    initialState: memberToState(member),
    onSave: async (s) => {
      // For non-readonly roles, persist an empty grants array —
      // role check inside can_access() handles access.
      const payload = {
        role: s.role,
        tags: s.tags,
        grants: s.role === 'readonly' ? s.grants : [],
      };
      const res = await fetch(`/api/workspaces/members/${member.member_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      onSaved();
    },
  });

  const matrixDisabled = state.role !== 'readonly';

  const sensitiveLabels = useMemo(
    () =>
      sensitiveSelected
        .map((id) => RESOURCE_BY_ID.get(id)?.label ?? id)
        .sort(),
    [sensitiveSelected],
  );

  const handleClose = async () => {
    await flushSave();
    onClose();
  };

  const handleCancel = async () => {
    await cancel();
    showToast('Changes reverted.');
    onClose();
  };

  async function handleRemove() {
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const res = await fetch(`/api/workspaces/members/${member.member_id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setRemoveError(body?.error ?? `Remove failed (${res.status})`);
        return;
      }
      showToast('Member removed.');
      onRemoved();
      onClose();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setRemoveBusy(false);
      setRemoveConfirm(false);
    }
  }

  const cannotRemove = isCallerSelf || member.is_workspace_owner;

  return (
    <>
      <SlideOver
        open={open}
        onClose={() => void handleClose()}
        title="Manage member"
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
                    checked={state.role === r}
                    onChange={() => set((p) => ({ ...p, role: r }))}
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
              value={state.tags}
              onChange={(next) => set((p) => ({ ...p, tags: next }))}
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
              value={state.grants}
              onChange={(next) => set((p) => ({ ...p, grants: next }))}
              disabled={matrixDisabled}
              onSensitiveGrantsChange={setSensitiveSelected}
            />
          </div>

          {/* Sensitive grants warning — visible the moment a
              sensitive grant flips on. With auto-save, this panel
              IS the gate: the user sees what they just enabled,
              and Cancel restores the snapshot if they don't
              actually want it. The Sprint 9 confirm-on-Save modal
              is removed. */}
          {state.role === 'readonly' && sensitiveSelected.length > 0 ? (
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
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--color-lp-orange)',
                  marginBottom: 'var(--lp-space-1)',
                }}
              >
                <AlertTriangle size={12} aria-hidden />
                Sensitive grants
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
                Hit Cancel to revert if this isn&apos;t what you intended.
              </div>
            </div>
          ) : null}

          {removeError ? (
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
              {removeError}
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
              disabled={cannotRemove}
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
              <SaveStatus
                status={status}
                lastSavedAt={lastSavedAt}
                errorMessage={errorMessage}
                onRetry={() => void flushSave()}
              />
              <button
                type="button"
                onClick={() => void handleCancel()}
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
                title="Discard the changes you just made."
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleClose()}
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
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </SlideOver>

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
          busy={removeBusy}
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
