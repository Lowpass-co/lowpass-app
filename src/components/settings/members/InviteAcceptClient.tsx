'use client';

/* ============================================
   LOWPASS — InviteAcceptClient (Sprint 9 §3)

   Client component that powers /invite/accept. Renders the
   email the invite was sent to + an Accept button. On accept,
   POST /api/workspaces/invite/accept with the token; the
   server RPC validates and creates the workspace_members row.

   On success: redirect to / (home). The accept_workspace_invite
   RPC sets profiles.workspace_id only on first workspace, so
   existing multi-workspace users land in their previous active
   workspace and discover the new one via the switcher.
   ============================================ */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface InviteAcceptClientProps {
  token: string;
  userEmail: string;
}

export function InviteAcceptClient({
  token,
  userEmail,
}: InviteAcceptClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/workspaces/invite/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as
        | { workspace_id?: string; error?: string }
        | null;
      if (!res.ok) {
        const msg = body?.error ?? `Accept failed (${res.status})`;
        setError(messageForStatus(res.status, msg));
        return;
      }
      setAccepted(true);
      // Refresh server components, then route to home. The
      // accept_workspace_invite RPC may have updated
      // profiles.workspace_id (first-workspace case) — refresh
      // picks that up before we navigate.
      router.refresh();
      setTimeout(() => router.push('/'), 600);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setBusy(false);
    }
  }

  if (accepted) {
    return (
      <div
        style={{
          fontSize: 'var(--lp-text-sm)',
          color: 'var(--lp-text)',
        }}
      >
        Welcome to the workspace. Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--lp-space-3)',
      }}
    >
      <p style={{ margin: 0, fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
        You&apos;re signed in as <strong>{userEmail}</strong>. Click Accept to
        join this workspace. If this isn&apos;t the email the invite was sent
        to, sign out first and sign in with the right account.
      </p>

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

      <div className="flex justify-end" style={{ gap: 'var(--lp-space-2)' }}>
        <button
          type="button"
          onClick={() => void handleAccept()}
          disabled={busy}
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
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : null}
          Accept invite
        </button>
      </div>
    </div>
  );
}

function messageForStatus(status: number, fallback: string): string {
  switch (status) {
    case 403:
      return 'This invite was sent to a different email. Sign out and sign in with the invited address.';
    case 404:
      return 'Invite not found. The link may have been revoked.';
    case 410:
      return 'This invite has expired or has already been accepted. Ask your admin for a new one.';
    default:
      return fallback;
  }
}
