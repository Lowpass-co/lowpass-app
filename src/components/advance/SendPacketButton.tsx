'use client';

/* ============================================
   LOWPASS — Send Packet button + generate-link modal (T3.3)

   Replaces the hero's static "Send Packet" link. Opens a modal where
   the TM generates a venue-intake link (/advance-intake/<token>),
   copies it to send to the venue, and revokes old links. The venue
   fills the public form; answers merge back into this show's advance.

   Talks to /api/advance/intake (create + list) and
   /api/advance/intake/[id] (revoke).
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Send, Copy, Check, Link2, Ban } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

interface IntakeLink {
  id: string;
  token: string;
  status: 'pending' | 'submitted' | 'revoked' | string;
  recipient_name: string | null;
  recipient_email: string | null;
  created_at: string;
  expires_at: string | null;
  submitted_at: string | null;
  submitted_by_name: string | null;
}

const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: 13,
  background: 'var(--lp-bg-deep)',
  color: 'var(--lp-text)',
  border: '1px solid var(--lp-border-strong)',
  borderRadius: 8,
  outline: 'none',
};

function intakeUrl(token: string): string {
  const origin =
    typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/advance-intake/${token}`;
}

export function SendPacketButton({
  tourId,
  routingId,
}: {
  tourId: string;
  routingId: string;
}) {
  const [open, setOpen] = useState(false);
  const [links, setLinks] = useState<IntakeLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [expiresInDays, setExpiresInDays] = useState<string>('30');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch(`/api/advance/intake?tourId=${tourId}&routingId=${routingId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}`))))
      .then((j: { links?: IntakeLink[] }) => setLinks(j.links ?? []))
      .catch(() => setError('Could not load existing links.'))
      .finally(() => setLoading(false));
  }, [tourId, routingId]);

  useEffect(() => {
    if (open) {
      setError(null);
      load();
    }
  }, [open, load]);

  const generate = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/advance/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId,
          routingId,
          recipientName: recipientName || undefined,
          recipientEmail: recipientEmail || undefined,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? 'Could not generate link.');
      }
      const j = (await res.json()) as { link: IntakeLink };
      setLinks((prev) => [j.link, ...prev]);
      setRecipientName('');
      setRecipientEmail('');
      // Auto-copy the fresh link.
      void copy(j.link);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate link.');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (link: IntakeLink) => {
    try {
      await navigator.clipboard.writeText(intakeUrl(link.token));
      setCopiedId(link.id);
      window.setTimeout(
        () => setCopiedId((c) => (c === link.id ? null : c)),
        1800,
      );
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const revoke = async (link: IntakeLink) => {
    try {
      const res = await fetch(`/api/advance/intake/${link.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revoke' }),
      });
      if (!res.ok) throw new Error();
      setLinks((prev) =>
        prev.map((l) => (l.id === link.id ? { ...l, status: 'revoked' } : l)),
      );
    } catch {
      setError('Could not revoke link.');
    }
  };

  const activeLinks = links.filter((l) => l.status !== 'revoked');

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-transition group inline-flex items-center gap-1.5 rounded-lg px-4 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-lp-orange)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--lp-bg)]"
        style={{
          background: 'var(--color-lp-orange)',
          color: '#FFFFFF',
          fontSize: '13px',
          fontWeight: 600,
        }}
        title="Generate a link for the venue to fill in this advance"
      >
        <Send className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        Send Packet
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Send Packet to venue"
        subtitle="Generate a link the venue fills in. Their answers flow straight back into this show’s advance."
        size="md"
      >
        <div className="flex flex-col gap-5">
          {/* Generate form */}
          <div
            className="flex flex-col gap-3 rounded-xl border p-4"
            style={{
              borderColor: 'var(--lp-border-strong)',
              background: 'var(--lp-bg-deep)',
            }}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
                  Venue contact (optional)
                </span>
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Name"
                  style={fieldStyle}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
                  Expires
                </span>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                  style={{ ...fieldStyle, cursor: 'pointer' }}
                >
                  <option value="7">In 7 days</option>
                  <option value="30">In 30 days</option>
                  <option value="90">In 90 days</option>
                  <option value="">Never</option>
                </select>
              </label>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={creating}
              className="btn-transition inline-flex items-center justify-center gap-1.5 rounded-lg disabled:opacity-60"
              style={{
                padding: '9px 14px',
                background: 'var(--color-lp-orange)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: creating ? 'default' : 'pointer',
              }}
            >
              <Link2 size={14} />
              {creating ? 'Generating…' : 'Generate link'}
            </button>
          </div>

          {error ? (
            <p role="alert" style={{ fontSize: 13, color: 'var(--color-lp-error)' }}>
              {error}
            </p>
          ) : null}

          {/* Existing links */}
          <div className="flex flex-col gap-2">
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)' }}>
              Links
            </span>
            {loading ? (
              <p style={{ fontSize: 13, color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
                Loading…
              </p>
            ) : activeLinks.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--lp-text-tertiary)', fontStyle: 'italic' }}>
                No active links yet. Generate one above.
              </p>
            ) : (
              activeLinks.map((link) => (
                <div
                  key={link.id}
                  className="flex items-center gap-2 rounded-lg border p-2.5"
                  style={{
                    borderColor: 'var(--lp-border-strong)',
                    background: 'var(--lp-surface)',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className="truncate"
                      style={{ fontSize: 12, color: 'var(--lp-text)', fontFamily: 'var(--lp-mono-font)' }}
                    >
                      {intakeUrl(link.token)}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--lp-text-tertiary)', marginTop: 2 }}>
                      {link.status === 'submitted'
                        ? `Submitted${link.submitted_by_name ? ` by ${link.submitted_by_name}` : ''}`
                        : 'Awaiting response'}
                      {link.recipient_name ? ` · ${link.recipient_name}` : ''}
                    </div>
                  </div>
                  {link.status === 'submitted' ? (
                    <span
                      className="advance-badge advance-badge--complete shrink-0"
                      style={{ fontSize: 9 }}
                    >
                      <span className="advance-badge__dot" />
                      Submitted
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => copy(link)}
                    className="btn-transition inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1"
                    style={{
                      borderColor: 'var(--lp-border-strong)',
                      background: 'var(--lp-bg)',
                      color: 'var(--lp-text-secondary)',
                      fontSize: 12,
                    }}
                    title="Copy link"
                  >
                    {copiedId === link.id ? (
                      <>
                        <Check size={13} style={{ color: 'var(--color-lp-status-complete)' }} />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        Copy
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(link)}
                    className="btn-transition inline-flex shrink-0 items-center justify-center rounded-md border p-1.5"
                    style={{
                      borderColor: 'var(--lp-border-strong)',
                      background: 'var(--lp-bg)',
                      color: 'var(--lp-text-tertiary)',
                    }}
                    title="Revoke link"
                    aria-label="Revoke link"
                  >
                    <Ban size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
