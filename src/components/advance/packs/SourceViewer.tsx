'use client';

/* <SourceViewer> — reopen a saved info pack at the place an answer came
   from (or at page 1 from Venue documents). */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { FieldSource } from '@/server/advance/show';
import { packFileUrl } from '../api';
import { PackViewer } from './PackViewer';

export function SourceViewer({ tourId, source, label, onClose }: { tourId: string; source: FieldSource; label: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<{ num: number; text: string }[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const name = source.file_name ?? 'Info pack';
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  const kind: 'pdf' | 'image' | 'text' = ext === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext) ? 'image' : 'text';

  useEffect(() => {
    let live = true;
    if (!source.doc_id) {
      setErr('This answer’s file isn’t kept.');
      return;
    }
    packFileUrl(tourId, { doc: source.doc_id })
      .then(async ({ url: u }) => {
        if (!live) return;
        if (kind === 'text') {
          const t = await fetch(u).then((r) => r.text());
          if (live) setText([{ num: 1, text: t.slice(0, 200_000) }]);
        } else setUrl(u);
      })
      .catch((e: Error) => live && setErr(e.message));
    return () => {
      live = false;
    };
  }, [tourId, source.doc_id, kind]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="adv-sheet" role="dialog" aria-modal="true" aria-label={`${name} — where “${label}” came from`}>
      <header className="adv-sheet-head">
        <div className="adv-grow" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--lp-text-md)', fontWeight: 600 }}>{label}</div>
          <div className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
            {name}
            {source.page ? `, page ${source.page}` : ''}
            {source.quote ? ` · “${source.quote.slice(0, 90)}${source.quote.length > 90 ? '…' : ''}”` : ''}
          </div>
        </div>
        <button type="button" className="adv-btn adv-btn-ghost adv-btn-sm" aria-label="Close" onClick={onClose}>
          <X size={16} aria-hidden />
        </button>
      </header>
      {err ? <div className="adv-banner" style={{ margin: 20 }}>{err}</div> : null}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--lp-bg-deep)' }}>
        <PackViewer url={url} kind={kind} page={source.page ?? 1} quote={source.quote ?? null} label={source.quote ? label : null} textPages={text ?? undefined} />
      </div>
    </div>
  );
}
