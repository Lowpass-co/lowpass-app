'use client';

/* ============================================
   LOWPASS — "Link to…" for a tour file (Nov 2026, Adam)

   Tick the shows, venues and crew a file belongs to; it then shows up on each
   one's page. Each tick saves at once (POST / DELETE /api/file-links). A venue
   tick puts the file on every show at that venue, on any of your tours.
   ============================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import type { EntityType, LinkTarget } from '@/server/files/entityLinks';

export function LinkToDialog({ tourId, file, onClose }: { tourId: string; file: { id: string; name: string } | null; onClose: () => void }) {
  return file ? <Dialog tourId={tourId} file={file} onClose={onClose} /> : null;
}

const GROUPS: Array<{ type: EntityType; title: string; hint: string }> = [
  { type: 'show', title: 'Shows', hint: 'On that show’s advance page and its day in Dates & routing.' },
  { type: 'venue', title: 'Venues', hint: 'On every show at that venue — this tour and future ones.' },
  { type: 'person', title: 'Crew', hint: 'On their person panel.' },
];

function Dialog({ tourId, file, onClose }: { tourId: string; file: { id: string; name: string }; onClose: () => void }) {
  const { showToast } = useToast();
  const [targets, setTargets] = useState<LinkTarget[] | null>(null);
  const [links, setLinks] = useState<Map<string, string>>(new Map()); // `${type}:${entityId}` → link id
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [t, l] = await Promise.all([
        fetch(`/api/file-links/targets?tourId=${encodeURIComponent(tourId)}`, { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/file-links?fileId=${encodeURIComponent(file.id)}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setTargets((t as { targets?: LinkTarget[] }).targets ?? []);
      setLinks(new Map(((l as { links?: Array<{ id: string; type: EntityType; entityId: string }> }).links ?? []).map((x) => [`${x.type}:${x.entityId}`, x.id])));
    } catch {
      setError('Couldn’t load what this file can link to.');
      setTargets([]);
    }
  }, [tourId, file.id]);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (t: LinkTarget) => {
    const key = `${t.type}:${t.id}`;
    if (pending.has(key)) return;
    setPending((p) => new Set(p).add(key));
    const existing = links.get(key);
    try {
      if (existing) {
        const r = await fetch(`/api/file-links?id=${encodeURIComponent(existing)}`, { method: 'DELETE' });
        if (!r.ok) throw new Error();
        setLinks((m) => { const n = new Map(m); n.delete(key); return n; });
      } else {
        const r = await fetch('/api/file-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: file.id, type: t.type, entityId: t.id }) });
        const j = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
        if (!r.ok || !j.id) throw new Error(j.error);
        setLinks((m) => new Map(m).set(key, j.id!));
      }
    } catch (e) {
      showToast(e instanceof Error && e.message ? e.message : 'Couldn’t save that link', 'error');
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  };

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (targets ?? []).filter((t) => !s || `${t.label} ${t.sub ?? ''}`.toLowerCase().includes(s));
  }, [targets, q]);

  return (
    <Modal open onClose={onClose} title="Link to…" subtitle={`“${file.name}” shows up on each page you tick. The file stays in Files.`} size="md">
      <div className="flex items-center" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-2) var(--lp-space-3)', border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-bg)' }}>
        <Search size={14} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a show, venue or person" aria-label="Find" style={{ flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }} />
      </div>
      {error ? <p role="alert" style={{ marginTop: 'var(--lp-space-3)', fontSize: 'var(--lp-text-sm)', color: 'var(--color-lp-error)' }}>{error}</p> : null}
      {targets === null ? <p style={{ marginTop: 'var(--lp-space-3)', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Loading…</p> : null}

      <div style={{ marginTop: 'var(--lp-space-3)', maxHeight: '55vh', overflowY: 'auto' }}>
        {GROUPS.map((g) => {
          const items = filtered.filter((t) => t.type === g.type);
          if (!items.length) return null;
          const on = items.filter((t) => links.has(`${t.type}:${t.id}`)).length;
          return (
            <section key={g.type} style={{ marginBottom: 'var(--lp-space-4)' }}>
              <div className="flex items-baseline justify-between">
                <h3 style={{ margin: 0, fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{g.title}</h3>
                {on ? <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{on} linked</span> : null}
              </div>
              <p style={{ margin: '0 0 var(--lp-space-1)', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{g.hint}</p>
              {items.map((t) => {
                const key = `${t.type}:${t.id}`;
                const checked = links.has(key);
                return (
                  <button
                    key={key}
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={pending.has(key)}
                    onClick={() => void toggle(t)}
                    className="btn-transition flex w-full items-center text-left hover:bg-lp-surface-hover"
                    style={{ gap: 'var(--lp-space-3)', padding: 'var(--lp-space-2)', borderRadius: 'var(--lp-radius-md)', border: 0, background: 'transparent', cursor: 'pointer', opacity: pending.has(key) ? 0.6 : 1 }}
                  >
                    <span
                      className="inline-flex shrink-0 items-center justify-center"
                      style={{
                        width: 18, height: 18, borderRadius: 'var(--lp-radius-sm)',
                        border: `1.5px solid ${checked ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
                        background: checked ? 'var(--lp-orange)' : 'transparent', color: 'var(--lp-surface)',
                      }}
                    >
                      {checked ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{t.label}</span>
                      {t.sub ? <span className="block truncate" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>{t.sub}</span> : null}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
        {targets && filtered.length === 0 ? <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Nothing matches.</p> : null}
      </div>

      <div className="flex justify-end" style={{ marginTop: 'var(--lp-space-3)' }}>
        <Button variant="primary" size="md" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
