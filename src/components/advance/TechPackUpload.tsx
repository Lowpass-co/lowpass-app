/* ============================================
   LOWPASS — <TechPackUpload> (P7 · Checkpoint C)

   The intake page's alternative to form-filling: upload your venue tech pack
   (PDF/images). Posts to the token-gated extraction endpoint; results land
   PENDING for the TM. On success: "we'll pull the answers — you're done". On any
   failure: "we couldn't read this — the form's still here" — the form below
   stays, never a dead end.
   ============================================ */

'use client';

import { useRef, useState } from 'react';

type State = { kind: 'idle' } | { kind: 'reading' } | { kind: 'done'; count: number } | { kind: 'soft'; message: string };

export function TechPackUpload({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setState({ kind: 'reading' });
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('files', f));
    try {
      const res = await fetch(`/api/public/advance-intake/${token}/tech-pack`, { method: 'POST', body: fd });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; message?: string; error?: string };
      if (res.ok && json.ok) setState({ kind: 'done', count: json.count ?? 0 });
      else setState({ kind: 'soft', message: json.message || json.error || 'We couldn’t read this file — the form below is still here.' });
    } catch {
      setState({ kind: 'soft', message: 'We couldn’t read this file — the form below is still here.' });
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div
      className="rounded-2xl border p-4"
      style={{ borderColor: 'var(--lp-border-strong)', background: 'var(--lp-surface)' }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--lp-text)' }}>
            Already have a tech pack?
          </div>
          <div style={{ fontSize: 13, color: 'var(--lp-text-secondary)' }}>
            Upload it (PDF or images) and we’ll pull the answers for you — or fill in the form below.
          </div>
        </div>
        <label
          style={{
            flexShrink: 0,
            cursor: state.kind === 'reading' ? 'default' : 'pointer',
            borderRadius: 8,
            border: '1px solid var(--lp-orange)',
            color: 'var(--lp-orange)',
            padding: '8px 14px',
            fontSize: 14,
            fontWeight: 600,
            opacity: state.kind === 'reading' ? 0.6 : 1,
          }}
        >
          {state.kind === 'reading' ? 'Reading…' : 'Upload tech pack'}
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
            multiple
            disabled={state.kind === 'reading'}
            onChange={(e) => void onFiles(e.target.files)}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {state.kind === 'done' && (
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--lp-text)' }}>
          Thanks — we pulled {state.count} answer{state.count === 1 ? '' : 's'} from your pack. Your tour manager will
          review them. You can add anything else below, but you’re essentially done.
        </p>
      )}
      {state.kind === 'soft' && (
        <p style={{ marginTop: 10, fontSize: 13, color: 'var(--lp-text-secondary)' }}>{state.message}</p>
      )}
    </div>
  );
}
