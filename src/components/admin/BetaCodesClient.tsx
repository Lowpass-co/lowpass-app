'use client';

import { useCallback, useEffect, useState } from 'react';

type Code = {
  id: string;
  code: string;
  email: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  redeemed_at: string | null;
};

function status(c: Code): string {
  if (c.redeemed_at) return `Used ${new Date(c.redeemed_at).toLocaleDateString()}`;
  if (c.revoked_at) return 'Turned off';
  if (new Date(c.expires_at) < new Date()) return 'Expired';
  return `Open until ${new Date(c.expires_at).toLocaleDateString()}`;
}

export function BetaCodesClient() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Code | null>(null);

  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    fetch('/api/admin/beta-codes')
      .then((r) => r.json())
      .then((b: { codes?: Code[]; error?: string }) => {
        if (!live) return;
        if (b?.codes) setCodes(b.codes);
        else setError(b?.error ?? 'Could not load codes');
      })
      .catch(() => live && setError('Could not load codes'));
    return () => {
      live = false;
    };
  }, [version]);

  async function make(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await fetch('/api/admin/beta-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, note }),
    });
    const b = (await r.json().catch(() => null)) as { code?: Code; error?: string } | null;
    setBusy(false);
    if (!b?.code) return setError(b?.error ?? 'Could not make a code');
    setFresh(b.code);
    setEmail('');
    setNote('');
    load();
  }

  async function revoke(id: string) {
    await fetch('/api/admin/beta-codes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, revoke: true }),
    });
    load();
  }

  const signupUrl = typeof window !== 'undefined' ? `${window.location.origin}/signup` : '/signup';
  const message = fresh
    ? `You're invited to the Lowpass beta.\n\nSign up at ${signupUrl} with this email (${fresh.email}) and the code:\n\n${fresh.code}\n\nThe code works once, for this email, until ${new Date(fresh.expires_at).toLocaleDateString()}.`
    : '';

  const input: React.CSSProperties = {
    fontSize: 'var(--lp-text-sm)',
    padding: 'var(--lp-space-1) var(--lp-space-2)',
    background: 'var(--lp-panel)',
    color: 'var(--lp-text)',
    border: '1px solid var(--lp-border-subtle)',
    borderRadius: 'var(--lp-radius-md)',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--lp-space-4)' }}>
      <form onSubmit={make} style={{ display: 'flex', gap: 'var(--lp-space-2)', flexWrap: 'wrap' }}>
        <input aria-label="Email" type="email" required placeholder="tester@email.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ ...input, flex: '2 1 220px' }} />
        <input aria-label="Note" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ ...input, flex: '1 1 160px' }} />
        <button type="submit" disabled={busy} className="btn-transition" style={{ ...input, background: 'var(--color-lp-orange)', color: 'var(--lp-text-inverse)', border: 'none', cursor: 'pointer' }}>
          {busy ? 'Making…' : 'Make code'}
        </button>
      </form>
      {error ? <div role="alert" style={{ color: 'var(--color-lp-error)', fontSize: 'var(--lp-text-sm)' }}>{error}</div> : null}
      {fresh ? (
        <div style={{ border: '1px solid var(--lp-border-subtle)', borderRadius: 'var(--lp-radius-md)', padding: 'var(--lp-space-3)' }}>
          <div style={{ fontSize: 'var(--lp-text-sm)', marginBottom: 'var(--lp-space-2)' }}>
            Code for {fresh.email}: <strong style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: 1 }}>{fresh.code}</strong>
          </div>
          <textarea readOnly value={message} rows={7} style={{ ...input, width: '100%', fontFamily: 'inherit' }} />
          <button type="button" onClick={() => void navigator.clipboard.writeText(message)} className="btn-transition" style={{ ...input, marginTop: 'var(--lp-space-2)', cursor: 'pointer' }}>
            Copy message
          </button>
        </div>
      ) : null}
      <div role="table" aria-label="Codes" style={{ display: 'flex', flexDirection: 'column' }}>
        {codes.map((c) => (
          <div key={c.id} role="row" style={{ display: 'flex', alignItems: 'center', gap: 'var(--lp-space-3)', padding: 'var(--lp-space-2) 0', borderTop: '1px solid var(--lp-border-subtle)', fontSize: 'var(--lp-text-sm)' }}>
            <span style={{ flex: '2 1 0', minWidth: 0 }}>
              {c.email}
              {c.note ? <span style={{ color: 'var(--lp-text-tertiary)' }}> — {c.note}</span> : null}
            </span>
            <span style={{ flex: '1 1 0', fontFamily: 'var(--font-mono, monospace)' }}>{c.code}</span>
            <span style={{ flex: '1 1 0', color: 'var(--lp-text-secondary)' }}>{status(c)}</span>
            {!c.redeemed_at && !c.revoked_at ? (
              <button type="button" onClick={() => void revoke(c.id)} className="btn-transition" style={{ ...input, cursor: 'pointer' }}>
                Turn off
              </button>
            ) : (
              <span style={{ width: 72 }} />
            )}
          </div>
        ))}
        {codes.length === 0 ? <div style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-sm)' }}>No codes yet.</div> : null}
      </div>
    </div>
  );
}
