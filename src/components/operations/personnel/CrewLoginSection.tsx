'use client';

/* ============================================
   LOWPASS — <CrewLoginSection>: a crew member's app access on THIS tour,
   in their panel (Nov 2026, Adam). Replaces the retired Status pills.

   Explicit actions, never auto-saved (an invite or a grant isn't something
   to fire on a keystroke): pick a preset → "Give access" (PUT …/login);
   "Remove from this tour" (DELETE …/login). Invites show a Copy link — the
   app never emails. Workspace admins only (the database's rule); everyone
   else sees the state and why they can't change it.
   ============================================ */

import { useState } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { PRESETS, PRESET_LABELS, type Preset } from '@/lib/permissions/areas';
import { PRESET_HINTS, type LoginState } from '@/lib/personnel/crew';
import './crewRoster.css';

export function CrewLoginSection({
  tourId,
  memberId,
  login,
  hasEmail,
  canChange,
  onChanged,
}: {
  tourId: string;
  /** tour_personnel.id */
  memberId: string;
  login: LoginState;
  /** Their People record has an email (an invite needs one). */
  hasEmail: boolean;
  /** Workspace admin of the tour's workspace. */
  canChange: boolean;
  onChanged: () => void;
}) {
  const [preset, setPreset] = useState<Preset>(login.preset && login.preset !== 'custom' ? login.preset : 'crew');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(login.inviteUrl ?? null);
  const [copied, setCopied] = useState(false);

  const current =
    login.state === 'full'
      ? 'Admin or manager — sees every tour'
      : login.state === 'member'
        ? login.preset === 'custom'
          ? 'Has a login · custom access on this tour'
          : login.preset
            ? `Has a login · ${PRESET_LABELS[login.preset]}`
            : canChange
              ? 'Has a login · nothing on this tour'
              : 'Has a login'
        : login.state === 'invited'
          ? `Invited${login.preset && login.preset !== 'custom' ? ` · ${PRESET_LABELS[login.preset]}` : ''} — not signed up yet`
          : 'No login';

  const needsEmail = login.state === 'none' && !hasEmail;

  async function give() {
    setError(null);
    if (needsEmail && !email.trim()) {
      setError('Add an email to give them a login.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/personnel/${memberId}/login`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preset, email: email.trim() || null }),
      });
      const body = (await res.json().catch(() => null)) as { login?: { kind: string; url?: string }; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? `Couldn't change access (${res.status})`);
        return;
      }
      if (body?.login?.url) setLink(body.login.url);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/personnel/${memberId}/login`, { method: 'DELETE' });
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? `Couldn't remove access (${res.status})`);
        return;
      }
      setLink(null);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-2)' }}>
      <div className="lp-label-caps" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-secondary)' }}>
        App access
      </div>
      <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{current}</div>

      {link ? (
        <div className="cr-entry-line">
          <button
            type="button"
            className="cr-btn"
            onClick={() => void navigator.clipboard?.writeText(link).then(() => setCopied(true))}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
          <span className="cr-sub">Lowpass doesn’t send emails — send it yourself.</span>
        </div>
      ) : null}

      {canChange && login.state !== 'full' ? (
        <>
          <div className="cr-entry-line">
            <label className="cr-chip is-on">
              <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Access preset">
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {PRESET_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <span className="cr-sub" style={{ flex: 1 }}>{PRESET_HINTS[preset]} — this tour only</span>
          </div>
          {needsEmail ? (
            <input
              className="cr-input is-small"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email (needed for a login)"
              aria-label="Email for their login"
            />
          ) : null}
          <div className="cr-entry-line">
            <button type="button" className="cr-btn" onClick={() => void give()} disabled={busy}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : null}
              {login.state === 'none' ? 'Invite' : 'Give this access'}
            </button>
            {(login.state === 'member' && login.preset) || login.state === 'invited' ? (
              <button type="button" className="cr-btn" onClick={() => void remove()} disabled={busy}>
                Remove from this tour
              </button>
            ) : null}
          </div>
          <p className="cr-sub" style={{ whiteSpace: 'normal', margin: 0 }}>
            Adds to what they can already see — never takes any away. Change everything in Settings › Team &amp; roles.
          </p>
        </>
      ) : !canChange ? (
        <p className="cr-sub" style={{ whiteSpace: 'normal', margin: 0 }}>Only workspace admins can change app access.</p>
      ) : null}

      {error ? (
        <div className="cr-error" role="alert">
          {error}
        </div>
      ) : null}
    </section>
  );
}
