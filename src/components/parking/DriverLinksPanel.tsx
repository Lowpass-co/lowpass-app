'use client';

/* ============================================
   Send to drivers — short-lived links to this map (Nov 2026, Adam — 289)

   Make a link (label, how long, how many 3D opens); it's shown ONCE (only
   its hash is stored) with Copy / Text / Email; the list shows each link's
   state, views and 3D opens, and turns links off. Rules:
   src/lib/parking/driverLinks.ts.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Mail, MessageSquare } from 'lucide-react';
import { DRIVER_LINK, EXPIRY_CHOICES } from '@/lib/parking/driverLinks';
import type { OwnerDriverLink } from '@/server/parking/driverLinks';

export function DriverLinksPanel({ base, venueName, ensureSaved }: { base: string; venueName: string; ensureSaved: () => Promise<void> }) {
  const [links, setLinks] = useState<OwnerDriverLink[] | null>(null);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [hours, setHours] = useState<number>(DRIVER_LINK.defaultHours);
  const [max3d, setMax3d] = useState<number>(DRIVER_LINK.default3d);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ url: string; label: string | null } | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${base}/driver-links`).catch(() => null);
    const j = (await r?.json().catch(() => ({}))) as { links?: OwnerDriverLink[] } | undefined;
    setLinks(j?.links ?? []);
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      await ensureSaved();
      const r = await fetch(`${base}/driver-links`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: label || null, hours, max3d }) });
      const j = (await r.json().catch(() => ({}))) as { token?: string; link?: OwnerDriverLink; error?: string };
      if (!r.ok || !j.token) throw new Error(j.error ?? `Couldn’t make the link (${r.status}).`);
      setMade({ url: `${window.location.origin}/p/${j.token}`, label: j.link?.label ?? null });
      setCopied(false);
      setLabel('');
      setOpen(false);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t make the link.');
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async (id: string) => {
    await fetch(`${base}/driver-links?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
    void load();
  };

  const message = made ? `Parking at ${venueName}${made.label ? ` (${made.label})` : ''}: ${made.url}` : '';
  const live = (links ?? []).filter((l) => l.state === 'live');
  const done = (links ?? []).filter((l) => l.state !== 'live').slice(0, 5);
  const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <section className="pk-sec" aria-label="Send to drivers">
      <h3>Send to drivers</h3>

      {made ? (
        <div className="pk-made" role="status">
          <b>Link ready{made.label ? ` — ${made.label}` : ''}</b>
          <input className="adv-field adv-mono" readOnly value={made.url} onFocus={(e) => e.target.select()} aria-label="Driver link" />
          <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="adv-btn adv-btn-sm adv-btn-primary"
              onClick={() => {
                void navigator.clipboard?.writeText(made.url).then(() => setCopied(true));
              }}
            >
              <Copy size={13} aria-hidden /> {copied ? 'Copied' : 'Copy'}
            </button>
            <a className="adv-btn adv-btn-sm" href={`sms:?&body=${encodeURIComponent(message)}`}>
              <MessageSquare size={13} aria-hidden /> Text it
            </a>
            <a className="adv-btn adv-btn-sm" href={`mailto:?subject=${encodeURIComponent(`Parking — ${venueName}`)}&body=${encodeURIComponent(message)}`}>
              <Mail size={13} aria-hidden /> Email
            </a>
          </div>
          <span className="pk-muted">Copy it now — for safety it isn’t shown again (make another any time).</span>
          <button type="button" className="adv-link" style={{ alignSelf: 'flex-start' }} onClick={() => setMade(null)}>Done</button>
        </div>
      ) : null}

      {open ? (
        <div className="pk-chooser">
          <label className="pk-field">
            Who’s it for (optional)
            <input className="adv-field" value={label} maxLength={DRIVER_LINK.labelMax} placeholder="e.g. Bus 2 – Dave" onChange={(e) => setLabel(e.target.value)} />
          </label>
          <div className="pk-grid2">
            <label className="pk-field">
              Lasts
              <select className="adv-field" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
                {EXPIRY_CHOICES.map((c) => (
                  <option key={c.hours} value={c.hours}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="pk-field">
              3D views allowed
              <input className="adv-field" type="number" min={0} max={DRIVER_LINK.max3d} value={max3d} onChange={(e) => setMax3d(Math.max(0, Math.min(DRIVER_LINK.max3d, Math.round(Number(e.target.value) || 0))))} />
            </label>
          </div>
          <span className="pk-muted">
            The driver sees this map — plan, 3D, Navigate buttons — and its notes (gate codes included) until the link ends. Each 3D view is a Google session (~0.6 ¢ after the free 1,000 a month); the plan is free.
          </span>
          {error ? <span className="pk-warntext" role="alert">{error}</span> : null}
          <div className="adv-row-flex" style={{ gap: 'var(--lp-space-2)' }}>
            <button type="button" className="adv-btn adv-btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button type="button" className="adv-btn adv-btn-sm adv-btn-primary" style={{ marginLeft: 'auto' }} onClick={() => void make()} disabled={busy}>
              {busy ? 'Making…' : 'Make the link'}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="adv-btn adv-btn-sm" onClick={() => setOpen(true)}>
          <Link2 size={13} aria-hidden /> Send to a driver
        </button>
      )}

      {live.length || done.length ? (
        <ul className="pk-linklist">
          {[...live, ...done].map((l) => (
            <li key={l.id} data-state={l.state}>
              <span className="adv-grow">
                <b>{l.label || 'Driver link'}</b>
                <span className="pk-muted">
                  {' '}
                  · {l.state === 'live' ? `ends ${fmt(l.expiresAt)}` : l.state === 'revoked' ? 'turned off' : 'expired'} · opened {l.views}× · 3D {l.opens3d}/{l.max3d}
                </span>
              </span>
              {l.state === 'live' ? (
                <button type="button" className="adv-link" onClick={() => void turnOff(l.id)}>Turn off</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
