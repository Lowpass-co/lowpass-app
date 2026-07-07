'use client';

/* ============================================
   LOWPASS — InviteMemberSlideOver (Sprint 9 §3)

   Admin-only slide-over that creates a workspace_invites row.
   Sprint 9 v1 returns a copyable invite URL — admin shares it
   manually. Sprint 10 wires Supabase Auth invite email.
   ============================================ */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Copy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { SlideOver } from '@/components/shell/SlideOver';
import { TagEditor } from './TagEditor';
import { PermissionMatrix } from './PermissionMatrix';
import { RESOURCE_BY_ID } from '@/lib/permissions/resources';
import type {
  GrantInput,
  WorkspaceRole,
} from '@/lib/permissions/types';

interface InviteMemberSlideOverProps {
  open: boolean;
  knownTags: string[];
  suggestedTags: string[];
  /** Emails already a member or with a pending invite — disables submit if duplicate. */
  existingEmails: ReadonlySet<string>;
  onClose: () => void;
  onInvited: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberSlideOver({
  open,
  knownTags,
  suggestedTags,
  existingEmails,
  onClose,
  onInvited,
}: InviteMemberSlideOverProps) {
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('readonly');
  const [tags, setTags] = useState<string[]>([]);
  const [grants, setGrants] = useState<GrantInput[]>([]);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [sensitiveSelected, setSensitiveSelected] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyAck, setEmptyAck] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset on open.
  useEffect(() => {
    if (!open) return;
    setEmail('');
    setRole('readonly');
    setTags([]);
    setGrants([]);
    setMatrixOpen(false);
    setSensitiveSelected([]);
    setEmptyAck(false);
    setError(null);
    setInviteUrl(null);
    setCopied(false);
  }, [open]);

  useEffect(
    () => () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    },
    [],
  );

  const normalizedEmail = email.trim().toLowerCase();
  const emailValid = EMAIL_RE.test(normalizedEmail);
  const duplicateEmail = emailValid && existingEmails.has(normalizedEmail);

  const sensitiveLabels = useMemo(
    () =>
      sensitiveSelected
        .map((id) => RESOURCE_BY_ID.get(id)?.label ?? id)
        .sort(),
    [sensitiveSelected],
  );

  const matrixDisabled = role !== 'readonly';
  const wouldBeEmpty = role === 'readonly' && grants.length === 0;
  const canSubmit = emailValid && !duplicateEmail && !submitting && (!wouldBeEmpty || emptyAck);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/workspaces/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          role,
          tags,
          grants: role === 'readonly' ? grants : [],
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { invite?: { id: string; url: string; expires_at: string }; error?: string }
        | null;
      if (!res.ok || !body?.invite) {
        setError(body?.error ?? `Invite failed (${res.status})`);
        return;
      }
      setInviteUrl(body.invite.url);
      onInvited();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Could not copy — select and copy manually.');
    }
  }

  return (
    <SlideOver open={open} onClose={onClose} title="Invite member" width="wide">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--lp-space-4)',
          padding: 'var(--lp-space-4)',
        }}
      >
        {inviteUrl ? (
          // Post-submit success view: copyable URL.
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--lp-space-3)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--lp-text-base)',
                fontWeight: 'var(--lp-weight-semibold)',
                color: 'var(--lp-text)',
              }}
            >
              Invite created
            </div>
            <div
              style={{
                fontSize: 'var(--lp-text-sm)',
                color: 'var(--lp-text-secondary)',
              }}
            >
              Share this link with <strong>{normalizedEmail}</strong>. The link
              expires in 14 days. Email delivery via Supabase Auth ships in
              Sprint 10; for now copy it and send via your own channel.
            </div>
            <div
              className="flex items-stretch"
              style={{
                gap: 0,
                border: '1px solid var(--lp-border-strong)',
                borderRadius: 'var(--lp-radius-md)',
                overflow: 'hidden',
              }}
            >
              <input
                readOnly
                value={inviteUrl}
                onFocus={(e) => e.currentTarget.select()}
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-xs)',
                  fontFamily: 'var(--lp-font-mono, ui-monospace, SFMono-Regular)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: 'none',
                  outline: 'none',
                }}
              />
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text-inverse)',
                  background: 'var(--color-lp-orange)',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2.4} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
              <button
                type="button"
                onClick={onClose}
                className="btn-transition"
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
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
        ) : (
          <>
            {/* Email */}
            <div>
              <label
                htmlFor="lp-invite-email"
                className="lp-label-caps"
                style={{
                  display: 'block',
                  marginBottom: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                }}
              >
                Email *
              </label>
              <input
                id="lp-invite-email"
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                placeholder="assistant@example.com"
                autoComplete="off"
                spellCheck={false}
                style={{
                  width: '100%',
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-base)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-bg)',
                  border: '1px solid var(--lp-border-strong)',
                  borderRadius: 'var(--lp-radius-md)',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  marginTop: 'var(--lp-space-1)',
                  fontSize: 'var(--lp-text-xs)',
                  color: duplicateEmail
                    ? 'var(--color-lp-error)'
                    : 'var(--lp-text-tertiary)',
                }}
              >
                {duplicateEmail
                  ? 'Already a member or has a pending invite.'
                  : 'They’ll receive a sign-up link expiring in 14 days.'}
              </div>
            </div>

            {/* Role */}
            <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
              <legend
                className="lp-label-caps"
                style={{
                  fontSize: 'var(--lp-text-2xs)',
                  color: 'var(--lp-text-secondary)',
                  marginBottom: 'var(--lp-space-2)',
                }}
              >
                Role *
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
                      name="invite-role"
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

            {/* Initial permissions (collapsible) */}
            <div>
              <button
                type="button"
                onClick={() => setMatrixOpen((o) => !o)}
                className="btn-transition inline-flex items-center"
                style={{
                  gap: 4,
                  padding: 'var(--lp-space-1) 0',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-medium)',
                  color: 'var(--lp-text)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                {matrixOpen ? (
                  <ChevronDown size={14} strokeWidth={2.4} />
                ) : (
                  <ChevronRight size={14} strokeWidth={2.4} />
                )}
                Initial permissions
                {grants.length > 0 ? (
                  <span
                    style={{
                      marginLeft: 6,
                      padding: '0 6px',
                      fontSize: 'var(--lp-text-xs)',
                      color: 'var(--color-lp-orange)',
                      background: 'color-mix(in srgb, var(--color-lp-orange) 12%, transparent)',
                      borderRadius: 999,
                    }}
                  >
                    {grants.length}
                  </span>
                ) : null}
              </button>
              <div
                style={{
                  marginTop: 4,
                  fontSize: 'var(--lp-text-xs)',
                  color: 'var(--lp-text-tertiary)',
                }}
              >
                Optional. Grant now or after they accept. Read-only members
                see only granted pages.
              </div>
              {matrixOpen ? (
                <div style={{ marginTop: 'var(--lp-space-2)' }}>
                  <PermissionMatrix
                    value={grants}
                    onChange={setGrants}
                    disabled={matrixDisabled}
                    onSensitiveGrantsChange={setSensitiveSelected}
                  />
                </div>
              ) : null}
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
                On accept, this member will see:
                <ul style={{ marginTop: 4, marginLeft: 18, lineHeight: 1.6 }}>
                  {sensitiveLabels.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* Empty-permissions ack */}
            {wouldBeEmpty ? (
              <div
                style={{
                  padding: 'var(--lp-space-2) var(--lp-space-3)',
                  fontSize: 'var(--lp-text-sm)',
                  color: 'var(--lp-text)',
                  background: 'var(--lp-panel)',
                  border: '1px solid var(--lp-border-subtle)',
                  borderRadius: 'var(--lp-radius-md)',
                }}
              >
                <label className="inline-flex items-start" style={{ gap: 8 }}>
                  <input
                    type="checkbox"
                    checked={emptyAck}
                    onChange={(e) => setEmptyAck(e.target.checked)}
                    style={{
                      marginTop: 2,
                      accentColor: 'var(--color-lp-orange)',
                    }}
                  />
                  <span>
                    This member won&apos;t see anything until you grant
                    permissions later. Continue without granting now.
                  </span>
                </label>
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
            <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
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
                onClick={() => void handleSubmit()}
                disabled={!canSubmit}
                className="btn-transition btn-primary-press inline-flex items-center"
                style={{
                  gap: 6,
                  padding: 'var(--lp-space-2) var(--lp-space-4)',
                  fontSize: 'var(--lp-text-sm)',
                  fontWeight: 'var(--lp-weight-semibold)',
                  color: canSubmit ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)',
                  background: canSubmit
                    ? 'var(--color-lp-orange)'
                    : 'var(--lp-surface-hover)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--lp-radius-md)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : null}
                Send invite
              </button>
            </div>
          </>
        )}
      </div>
    </SlideOver>
  );
}
