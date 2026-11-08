'use client';

/* ============================================
   LOWPASS — Share a tour file or folder (Nov 2026, Adam)

   Opened from a file card's or folder tile's ⋯ menu on tour Files. Make a
   link (view only / can edit, optional "for", expiry and password), copy it,
   turn it off, and see what people did through it — including getting back
   a version someone replaced. Talks to /api/file-share-links.
   ============================================ */

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Download, Eye, Link2, Lock, PenLine, Upload } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { formatRelativeTime } from '@/lib/format-relative';
import { endOfDayIso, type ShareAccess } from '@/lib/files/shareLinks';
import type { OwnerEvent, OwnerLink } from '@/server/files/shareLinks';

export type ShareTarget = { kind: 'file'; fileId: string; name: string } | { kind: 'folder'; path: string };

const linkUrl = (token: string) => `${window.location.origin}/f/${token}`;

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ShareLinkDialog({ tourId, target, onClose }: { tourId: string; target: ShareTarget | null; onClose: () => void }) {
  return target ? <Dialog tourId={tourId} target={target} onClose={onClose} /> : null;
}

function Dialog({ tourId, target, onClose }: { tourId: string; target: ShareTarget; onClose: () => void }) {
  const { showToast } = useToast();
  const [links, setLinks] = useState<OwnerLink[] | null>(null);
  const [events, setEvents] = useState<OwnerEvent[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [access, setAccess] = useState<ShareAccess>('view');
  const [label, setLabel] = useState('');
  const [expires, setExpires] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [justMade, setJustMade] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState<string | null>(null);

  const name = target.kind === 'file' ? target.name : target.path.split('/').pop() ?? target.path;
  const editMeans = target.kind === 'folder' ? 'Can add files and upload new versions' : 'Can upload a new version';

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ tourId });
    if (target.kind === 'file') qs.set('fileId', target.fileId);
    else qs.set('folder', target.path);
    try {
      const r = await fetch(`/api/file-share-links?${qs}`, { cache: 'no-store' });
      const j = (await r.json()) as { links?: OwnerLink[]; events?: OwnerEvent[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `Couldn’t load links (${r.status})`);
      setLinks(j.links ?? []);
      setEvents(j.events ?? []);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Couldn’t load links');
      setLinks([]);
    }
  }, [tourId, target]);

  useEffect(() => { void load(); }, [load]);

  const create = async () => {
    setFormError(null);
    const expiresAt = expires ? endOfDayIso(expires) : null;
    if (expires && !expiresAt) return setFormError('That date isn’t valid');
    setCreating(true);
    try {
      const r = await fetch('/api/file-share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tourId,
          ...(target.kind === 'file' ? { fileId: target.fileId } : { folder: target.path }),
          access,
          label: label || null,
          expiresAt,
          password: password || null,
        }),
      });
      const j = (await r.json()) as { link?: OwnerLink; error?: string };
      if (!r.ok || !j.link) throw new Error(j.error ?? 'Couldn’t make the link');
      const copied = await copy(linkUrl(j.link.token));
      showToast(copied ? 'Link made and copied' : 'Link made — copy it below');
      setJustMade(j.link.id);
      setLabel('');
      setPassword('');
      setExpires('');
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Couldn’t make the link');
    } finally {
      setCreating(false);
    }
  };

  const turnOff = async (id: string) => {
    setConfirmOff(null);
    const r = await fetch('/api/file-share-links', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, revoke: true }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      showToast(j.error ?? 'Couldn’t turn the link off', 'error');
      return;
    }
    showToast('Link turned off');
    await load();
  };

  const getPrevious = async (eventId: string) => {
    const r = await fetch(`/api/file-share-links/version?eventId=${encodeURIComponent(eventId)}`);
    const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!r.ok || !j.url) return showToast(j.error ?? 'Couldn’t get that version', 'error');
    window.location.href = j.url;
  };

  const live = (links ?? []).filter((l) => !l.revokedAt && !(l.expiresAt && new Date(l.expiresAt).getTime() <= Date.now()));
  const off = (links ?? []).filter((l) => !live.includes(l));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Modal open onClose={onClose} title={`Share “${name}”`} subtitle={target.kind === 'folder' ? 'Folder — includes everything inside it, and anything added later.' : 'One file.'} size="md">
      {/* New link */}
      <section style={card}>
        <div role="radiogroup" aria-label="Access" className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 'var(--lp-space-2)' }}>
          {([['view', Eye, 'View only', 'See and download'], ['edit', PenLine, 'Can edit', editMeans]] as const).map(([v, Icon, t, d]) => {
            const on = access === v;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setAccess(v)}
                className="btn-transition flex items-start text-left"
                style={{
                  gap: 'var(--lp-space-2)', padding: 'var(--lp-space-3)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--lp-text)' : 'var(--lp-border)'}`,
                  background: on ? 'var(--lp-surface-hover)' : 'var(--lp-panel)',
                }}
              >
                <Icon size={16} aria-hidden style={{ marginTop: 'var(--lp-space-1)', color: on ? 'var(--lp-text)' : 'var(--lp-text-tertiary)', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{t}</span>
                  <span style={{ display: 'block', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{d}</span>
                </span>
              </button>
            );
          })}
        </div>
        {access === 'edit' ? (
          <p style={{ ...hint, marginTop: 'var(--lp-space-2)' }}>They can’t rename, move or delete anything. Replaced versions are kept, and you can get them back from Activity.</p>
        ) : null}

        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--lp-space-3)', marginTop: 'var(--lp-space-3)' }}>
          <Field label="For (optional)" htmlFor="sl-label">
            <input id="sl-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Promoter" maxLength={80} style={input} />
          </Field>
          <Field label="Expires (optional)" htmlFor="sl-exp">
            <input id="sl-exp" type="date" min={today} value={expires} onChange={(e) => setExpires(e.target.value)} style={input} />
          </Field>
          <Field label="Password (optional)" htmlFor="sl-pw">
            <input id="sl-pw" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="None" style={input} />
          </Field>
        </div>
        {formError ? <p role="alert" style={{ ...hint, color: 'var(--color-lp-error)', marginTop: 'var(--lp-space-2)' }}>{formError}</p> : null}
        <div className="flex items-center justify-between" style={{ marginTop: 'var(--lp-space-3)', gap: 'var(--lp-space-3)' }}>
          <span style={hint}>Anyone with the link can open it{password ? ' with the password' : ''}.</span>
          <Button variant="primary" size="md" loading={creating} onClick={() => void create()} leadingIcon={<Link2 size={14} aria-hidden />}>
            Create link
          </Button>
        </div>
      </section>

      {/* Links */}
      <section style={{ marginTop: 'var(--lp-space-5)' }}>
        <h3 style={h3}>Links</h3>
        {loadError ? <p role="alert" style={{ ...hint, color: 'var(--color-lp-error)' }}>{loadError}</p> : null}
        {links === null ? <p style={hint}>Loading…</p> : live.length === 0 ? <p style={hint}>No live links yet.</p> : null}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {live.map((l) => (
            <li key={l.id} className={l.id === justMade ? 'lp-onb-rise' : undefined} style={row}>
              <span className="inline-flex shrink-0 items-center justify-center" style={{ ...badge, background: l.access === 'edit' ? '#FF45001a' : 'var(--lp-surface-hover)', color: l.access === 'edit' ? 'var(--lp-orange)' : 'var(--lp-text-secondary)' }}>
                {l.access === 'edit' ? <PenLine size={14} aria-hidden /> : <Eye size={14} aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate" style={{ fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)', color: 'var(--lp-text)' }}>
                  {l.label ?? 'Anyone with the link'}
                  {l.hasPassword ? <Lock size={12} aria-label="Password protected" style={{ display: 'inline', marginLeft: 'var(--lp-space-1)', color: 'var(--lp-text-tertiary)' }} /> : null}
                </div>
                <div style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                  {l.access === 'edit' ? 'Can edit' : 'View only'} · {l.expiresAt ? `expires ${new Date(l.expiresAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'no expiry'} · {l.lastViewedAt ? `opened ${formatRelativeTime(l.lastViewedAt)}` : 'not opened yet'}
                </div>
              </div>
              {confirmOff === l.id ? (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setConfirmOff(null)}>Keep</Button>
                  <Button variant="danger" size="sm" onClick={() => void turnOff(l.id)}>Turn off</Button>
                </>
              ) : (
                <>
                  <CopyButton url={linkUrl(l.token)} />
                  <Button variant="ghost" size="sm" onClick={() => setConfirmOff(l.id)}>Turn off</Button>
                </>
              )}
            </li>
          ))}
        </ul>
        {off.length ? <p style={{ ...hint, marginTop: 'var(--lp-space-2)' }}>{off.length} link{off.length === 1 ? '' : 's'} turned off or expired.</p> : null}
      </section>

      {/* Activity */}
      {events.length ? (
        <section style={{ marginTop: 'var(--lp-space-5)' }}>
          <h3 style={h3}>Activity</h3>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {events.map((e) => (
              <li key={e.id} className="flex items-center" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-2) 0', borderTop: '1px solid var(--lp-border)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                {e.action === 'download' ? <Download size={13} aria-hidden /> : <Upload size={13} aria-hidden />}
                <span className="min-w-0 flex-1 truncate">
                  <strong style={{ color: 'var(--lp-text)', fontWeight: 'var(--lp-weight-medium)' }}>{e.actor ?? 'Someone'}</strong>{' '}
                  {e.action === 'download' ? 'downloaded' : e.action === 'upload' ? 'added' : 'uploaded a new version of'}{' '}
                  {e.action === 'new_version' ? e.previousName ?? e.fileName : e.fileName}
                </span>
                {e.action === 'new_version' && e.hasPrevious ? (
                  <button type="button" onClick={() => void getPrevious(e.id)} className="btn-transition shrink-0" style={linkBtn}>Get previous</button>
                ) : null}
                <span className="shrink-0" style={{ color: 'var(--lp-text-tertiary)' }}>{formatRelativeTime(e.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Modal>
  );
}

function CopyButton({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      leadingIcon={done ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      onClick={async () => {
        if (await copy(url)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } else {
          window.prompt('Copy this link', url);
        }
      }}
    >
      {done ? 'Copied' : 'Copy'}
    </Button>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={htmlFor} style={{ display: 'block', marginBottom: 'var(--lp-space-1)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{label}</label>
      {children}
    </div>
  );
}

const card: React.CSSProperties = { padding: 'var(--lp-space-4)', borderRadius: 'var(--lp-radius-lg)', border: '1px solid var(--lp-border)', background: 'var(--lp-bg)' };
const hint: React.CSSProperties = { margin: 0, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', lineHeight: 'var(--lp-leading-normal)' };
const h3: React.CSSProperties = { margin: '0 0 var(--lp-space-2)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' };
const input: React.CSSProperties = {
  width: '100%', minWidth: 0, padding: 'var(--lp-space-2) var(--lp-space-3)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)',
  background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', outline: 'none',
};
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 'var(--lp-space-2)', padding: 'var(--lp-space-2) 0', borderTop: '1px solid var(--lp-border)' };
const badge: React.CSSProperties = { width: 28, height: 28, borderRadius: 'var(--lp-radius-md)' };
const linkBtn: React.CSSProperties = { padding: 0, border: 0, background: 'none', cursor: 'pointer', color: 'var(--lp-orange)', fontSize: 'var(--lp-text-xs)', fontWeight: 'var(--lp-weight-medium)' };
