'use client';

/* ============================================
   LOWPASS — Files linked to a show / venue / person (Nov 2026, Adam)

   One panel, used on the advance show page, Schedule's show panel, the venue
   editor and the person panel. Lists what's linked (GET /api/file-links) —
   for a show that includes files linked to its venue from any of your tours,
   labelled with where they came from.

   With a tourId (show pages) you can also:
     · Upload — saves into this tour's Files and links it here;
     · Link a file — pick one already in this tour's Files;
     · choose "this show" or "every show at <venue>" for either.
   × unlinks; it never deletes the file.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, FileText, Link2, Plus, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useToast } from '@/components/ui/Toast';
import { formatBytes } from '@/lib/files/shareLinks';
import { uploadToFiles } from '@/lib/uploads/filesUpload';
import type { EntityType, LinkedFile } from '@/server/files/entityLinks';

interface Props {
  type: EntityType;
  id: string;
  /** Show pages: enables Upload / Link a file into this tour's Files. */
  tourId?: string | null;
  /** Shown above the list; omit when the host already has a heading. */
  heading?: string | null;
  emptyText?: string;
}

export function LinkedFilesPanel({ type, id, tourId = null, heading = 'Files', emptyText }: Props) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<LinkedFile[] | null>(null);
  const [venue, setVenue] = useState<{ id: string; name: string } | null>(null);
  const [target, setTarget] = useState<'show' | 'venue'>('show');
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [tourFiles, setTourFiles] = useState<Array<{ id: string; file_name: string }> | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/file-links?type=${type}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = (await r.json()) as { files?: LinkedFile[]; venue?: { id: string; name: string } | null; error?: string };
      if (!r.ok) throw new Error(j.error ?? 'Couldn’t load files');
      setFiles(j.files ?? []);
      setVenue(j.venue ?? null);
    } catch {
      setFiles([]);
    }
  }, [type, id]);

  useEffect(() => { void load(); }, [load]);

  const canAdd = !!tourId && type === 'show';
  const linkAs = (): { type: EntityType; entityId: string } => (target === 'venue' && venue ? { type: 'venue', entityId: venue.id } : { type, entityId: id });

  const link = async (fileId: string) => {
    const r = await fetch('/api/file-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId, ...linkAs() }),
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      throw new Error(j.error ?? 'Couldn’t link the file');
    }
  };

  const upload = async (list: File[]) => {
    if (!tourId) return;
    for (const file of list) {
      setBusy(`${file.name} 0%`);
      try {
        const vm = await uploadToFiles({ scope: 'tour', scopeId: tourId, folder: null, file, onProgress: (f) => setBusy(`${file.name} ${Math.round(f * 100)}%`) });
        await link(vm.id.replace(/^ref:/, ''));
      } catch (e) {
        showToast(e instanceof Error ? e.message : `Couldn’t add ${file.name}`, 'error');
      }
    }
    setBusy(null);
    await load();
  };

  const openPicker = async () => {
    setPicking(true);
    if (tourFiles || !tourId) return;
    const r = await fetch(`/api/files?linked_to_type=tour&linked_to_id=${encodeURIComponent(tourId)}`, { cache: 'no-store' });
    const j = (await r.json().catch(() => ({}))) as { files?: Array<{ id: string; file_name: string }> };
    setTourFiles(j.files ?? []);
  };

  const pick = async (fileId: string) => {
    setPicking(false);
    setBusy('Linking…');
    try {
      await link(fileId);
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Couldn’t link the file', 'error');
    }
    setBusy(null);
  };

  const unlink = async (f: LinkedFile) => {
    if (!f.linkId) return;
    setFiles((x) => (x ?? []).filter((y) => y.id !== f.id));
    const r = await fetch(`/api/file-links?id=${encodeURIComponent(f.linkId)}`, { method: 'DELETE' });
    if (!r.ok) {
      showToast('Couldn’t unlink that file', 'error');
      await load();
    }
  };

  const download = async (f: LinkedFile) => {
    if (!f.bucket || !f.path) return showToast('No stored copy to download', 'error');
    const { data, error } = await createClient().storage.from(f.bucket).createSignedUrl(f.path, 600, { download: f.name });
    if (error || !data?.signedUrl) return showToast('Couldn’t create a download link', 'error');
    window.open(data.signedUrl, '_blank', 'noopener');
  };

  const shown = new Set((files ?? []).map((f) => f.id));
  const why = (f: LinkedFile): string | null => {
    const from = f.tourId && f.tourId !== tourId ? `from ${f.tourName ?? 'another tour'}` : null;
    // On the venue's own page "venue" says nothing; on a show it says why it's here.
    if (f.via === 'venue' && type !== 'venue') return [venue ? `every show at ${venue.name}` : 'venue', from].filter(Boolean).join(' · ');
    if (f.via === 'home') return 'stored on this show';
    return from;
  };

  return (
    <div className="flex flex-col" style={{ gap: 'var(--lp-space-2)' }}>
      {heading ? <h3 style={{ margin: 0, fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>{heading}</h3> : null}

      {files === null ? (
        <span style={muted}>Loading…</span>
      ) : files.length === 0 ? (
        <span style={muted}>{emptyText ?? (canAdd ? 'Deal memos, contracts, venue packs — anything from tour Files.' : 'Nothing linked yet. Link files from tour Files → ⋯ → Link to…')}</span>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {files.map((f) => (
            <li key={f.id} className="group flex items-center" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-1) 0' }}>
              <FileText size={15} aria-hidden style={{ color: 'var(--lp-text-tertiary)', flexShrink: 0 }} />
              <button type="button" onClick={() => void download(f)} className="min-w-0 flex-1 text-left" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit' }} title={`Download ${f.name}`}>
                <span className="block truncate" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{f.name}</span>
                <span className="block truncate" style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>
                  {[formatBytes(f.size), why(f)].filter(Boolean).join(' · ')}
                </span>
              </button>
              <button type="button" onClick={() => void download(f)} aria-label={`Download ${f.name}`} style={iconBtn}>
                <Download size={14} aria-hidden />
              </button>
              {f.linkId ? (
                <button type="button" onClick={() => void unlink(f)} aria-label={`Unlink ${f.name}`} title="Unlink (the file stays in Files)" style={iconBtn}>
                  <X size={14} aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canAdd ? (
        <>
          {venue ? (
            <div role="radiogroup" aria-label="Add to" className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-1)', fontSize: 'var(--lp-text-xs)' }}>
              <span style={{ color: 'var(--lp-text-secondary)', flexBasis: '100%' }}>Add new files to</span>
              {(
                [
                  ['show', 'This show'],
                  ['venue', `Every show at ${venue.name}`],
                ] as const
              ).map(([v, label]) => (
                <button key={v} type="button" role="radio" aria-checked={target === v} onClick={() => setTarget(v)} style={chip(target === v)}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap items-center" style={{ gap: 'var(--lp-space-3)' }}>
            <button type="button" onClick={() => input.current?.click()} disabled={!!busy} style={linkBtn}>
              <Upload size={13} aria-hidden /> Upload
            </button>
            <button type="button" onClick={() => void openPicker()} disabled={!!busy} style={linkBtn}>
              <Link2 size={13} aria-hidden /> Link a file
            </button>
            {busy ? <span style={muted}>{busy}</span> : null}
          </div>
          <input ref={input} type="file" multiple hidden onChange={(e) => { const l = [...(e.target.files ?? [])]; e.target.value = ''; void upload(l); }} />
          {picking ? (
            <div style={{ border: '1px solid var(--lp-border)', borderRadius: 'var(--lp-radius-md)', background: 'var(--lp-surface)', maxHeight: 240, overflowY: 'auto' }}>
              <div className="flex items-center justify-between" style={{ padding: 'var(--lp-space-2) var(--lp-space-3)', borderBottom: '1px solid var(--lp-border)' }}>
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }}>This tour’s files</span>
                <button type="button" onClick={() => setPicking(false)} aria-label="Close" style={iconBtn}><X size={13} aria-hidden /></button>
              </div>
              {tourFiles === null ? (
                <div style={{ ...muted, padding: 'var(--lp-space-3)' }}>Loading…</div>
              ) : tourFiles.filter((f) => !shown.has(f.id)).length === 0 ? (
                <div style={{ ...muted, padding: 'var(--lp-space-3)' }}>Everything in tour Files is already here.</div>
              ) : (
                tourFiles
                  .filter((f) => !shown.has(f.id))
                  .map((f) => (
                    <button key={f.id} type="button" onClick={() => void pick(f.id)} className="flex w-full items-center text-left hover:bg-lp-surface-hover" style={{ gap: 'var(--lp-space-2)', padding: 'var(--lp-space-2) var(--lp-space-3)', background: 'none', border: 0, cursor: 'pointer', color: 'var(--lp-text)', fontSize: 'var(--lp-text-sm)' }}>
                      <Plus size={13} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                      <span className="truncate">{f.file_name}</span>
                    </button>
                  ))
              )}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const muted: React.CSSProperties = { fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' };
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, flexShrink: 0,
  borderRadius: 'var(--lp-radius-sm)', border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer',
};
const linkBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--lp-space-1)', padding: 0, border: 0, background: 'none',
  cursor: 'pointer', color: 'var(--lp-orange)', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-medium)',
};
const chip = (on: boolean): React.CSSProperties => ({
  padding: '0 var(--lp-space-2)', borderRadius: 'var(--lp-radius-full)', cursor: 'pointer', fontSize: 'var(--lp-text-xs)', lineHeight: 'var(--lp-leading-normal)',
  border: `1px solid ${on ? 'var(--lp-text)' : 'var(--lp-border)'}`, background: on ? 'var(--lp-surface-hover)' : 'transparent', color: 'var(--lp-text)',
});
