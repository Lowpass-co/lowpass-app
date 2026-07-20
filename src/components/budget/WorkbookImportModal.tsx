'use client';

/* ============================================
   LOWPASS — <WorkbookImportModal> (X1-B)

   Upload a workbook → PROPOSALS (never direct writes). Our-layout files stage
   straight to the review list; a foreign layout shows a column-mapping preview to
   confirm first. Each proposed row is New / Possible duplicate / Changed — dups
   default-OFF (skip). "Import N accepted" writes through the existing budget path.
   ============================================ */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Kind = 'new' | 'exact_dup' | 'value_change';
interface Line { id: string; label: string; section: string; amount: number; kind: Kind; dupReason: string | null; defaultAccept: boolean; source_ref: string }
interface MappingPreview { sheet: string; headers: string[]; guesses: { role: string; column: string }[]; sampleRows: Record<string, unknown>[] }

const KIND_LABEL: Record<Kind, string> = { new: 'New', exact_dup: 'Possible duplicate', value_change: 'Changed' };
const KIND_COLOR: Record<Kind, string> = { new: 'var(--color-lp-status-complete)', exact_dup: 'var(--color-lp-warning)', value_change: 'var(--color-lp-warning)' };

export function WorkbookImportModal({ tourId, onClose }: { tourId: string; onClose: () => void }) {
  const router = useRouter();
  const fileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [accept, setAccept] = useState<Record<string, boolean>>({});
  const [mapping, setMapping] = useState<MappingPreview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{ written: number; errors: string[] } | null>(null);

  async function upload(withMap?: Record<string, string>) {
    const file = fileRef.current;
    if (!file) { setError('Choose a workbook file first.'); return; }
    setBusy(true); setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tourId', tourId);
      if (withMap) fd.append('map', JSON.stringify({ sheet: mapping?.sheet, ...withMap }));
      const res = await fetch('/api/import/workbook', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.detail || data.error || 'Import failed'); return; }
      setRejected(data.rejected ?? []);
      if (data.layout === 'foreign') { setMapping(data.mapping); return; }
      setBatchId(data.batchId);
      setLines(data.lines);
      setAccept(Object.fromEntries((data.lines as Line[]).map((l) => [l.id, l.defaultAccept])));
      setMapping(null);
    } finally { setBusy(false); }
  }

  async function apply() {
    if (!batchId || !lines) return;
    setBusy(true); setError(null);
    try {
      const acceptIds = lines.filter((l) => accept[l.id]).map((l) => l.id);
      const res = await fetch('/api/import/workbook/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId, accept: acceptIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.detail || data.error || 'Apply failed'); return; }
      setResult({ written: data.written, errors: data.errors ?? [] });
      router.refresh();
    } finally { setBusy(false); }
  }

  const acceptCount = lines ? lines.filter((l) => accept[l.id]).length : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(720px, 96vw)', maxHeight: '86vh', overflow: 'auto', background: 'var(--lp-panel)', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-lg)', padding: 'var(--lp-space-4)' }}>
        <header className="flex items-center justify-between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--lp-text-lg)', fontWeight: 'var(--lp-weight-bold)', color: 'var(--lp-text)' }}>Import workbook</h2>
          <button type="button" onClick={onClose} style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </header>

        {error ? <div role="alert" style={{ marginBottom: 10, padding: 8, fontSize: 'var(--lp-text-sm)', color: 'var(--color-lp-error)', background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lp-error) 25%, transparent)', borderRadius: 6 }}>{error}</div> : null}
        {rejected.length > 0 ? <ul style={{ margin: '0 0 10px', paddingLeft: 18, fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>{rejected.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}

        {result ? (
          <div>
            <p style={{ fontSize: 'var(--lp-text-base)', color: 'var(--lp-text)' }}>Imported <strong>{result.written}</strong> {result.written === 1 ? 'line' : 'lines'}.</p>
            {result.errors.length > 0 ? <ul style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--color-lp-error)' }}>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul> : null}
            <button type="button" onClick={onClose} className="btn-transition" style={btnPrimary}>Done</button>
          </div>
        ) : mapping ? (
          <div>
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Unrecognised layout — map the columns from <strong>{mapping.sheet}</strong>, then confirm.</p>
            {mapping.headers.map((h) => (
              <label key={h} className="flex items-center justify-between" style={{ gap: 8, padding: '4px 0' }}>
                <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{h}</span>
                <select value={map[h] ?? (mapping.guesses.find((g) => g.column === h)?.role ?? 'ignore')} onChange={(e) => setMap((m) => ({ ...m, [h]: e.target.value }))} style={selectStyle}>
                  {['ignore', 'name', 'amount', 'section', 'date'].map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
            ))}
            <button type="button" disabled={busy} onClick={() => {
              const chosen: Record<string, string> = {};
              for (const h of mapping.headers) { const role = map[h] ?? mapping.guesses.find((g) => g.column === h)?.role; if (role && role !== 'ignore') chosen[role] = h; }
              void upload(chosen);
            }} className="btn-transition" style={btnPrimary}>Confirm mapping →</button>
          </div>
        ) : lines ? (
          <div>
            <div style={{ maxHeight: '50vh', overflow: 'auto', border: '1px solid var(--lp-border-subtle)', borderRadius: 8 }}>
              {lines.map((l) => (
                <label key={l.id} className="flex items-center justify-between" style={{ gap: 10, padding: '8px 10px', borderBottom: '1px solid var(--lp-border-subtle)', cursor: 'pointer' }}>
                  <span className="flex items-center" style={{ gap: 8, minWidth: 0 }}>
                    <input type="checkbox" checked={!!accept[l.id]} onChange={(e) => setAccept((a) => ({ ...a, [l.id]: e.target.checked }))} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)' }}>{l.label} <span style={{ color: 'var(--lp-text-tertiary)' }}>· {l.section}</span></span>
                      {l.dupReason ? <span style={{ display: 'block', fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>{l.dupReason}</span> : null}
                    </span>
                  </span>
                  <span className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
                    <span className="lp-mono" style={{ fontSize: 13, color: 'var(--lp-text)' }}>{l.amount.toLocaleString()}</span>
                    <span className="lp-label-caps" style={{ fontSize: 9, color: KIND_COLOR[l.kind] }}>{KIND_LABEL[l.kind]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between" style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setAccept(Object.fromEntries(lines.filter((l) => l.kind === 'new').map((l) => [l.id, true])))} style={btnGhost}>Accept all non-duplicates</button>
              <button type="button" disabled={busy || acceptCount === 0} onClick={() => void apply()} className="btn-transition" style={btnPrimary}>Import {acceptCount} accepted</button>
            </div>
          </div>
        ) : (
          <div>
            <p style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>Upload an edited Lowpass workbook or a foreign budget sheet. Rows land as proposals for you to review — nothing writes until you accept.</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => { fileRef.current = e.target.files?.[0] ?? null; }} style={{ margin: '10px 0' }} />
            <div><button type="button" disabled={busy} onClick={() => void upload()} className="btn-transition" style={btnPrimary}>{busy ? 'Parsing…' : 'Upload & review'}</button></div>
          </div>
        )}
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = { marginTop: 4, padding: '6px 14px', fontSize: 'var(--lp-text-sm)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text-inverse)', background: 'var(--color-lp-orange)', border: 0, borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' };
const btnGhost: React.CSSProperties = { padding: '6px 10px', fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)', background: 'transparent', border: '1px solid var(--lp-border-strong)', borderRadius: 'var(--lp-radius-md)', cursor: 'pointer' };
const selectStyle: React.CSSProperties = { fontSize: 13, padding: '2px 6px', border: '1px solid var(--lp-border-strong)', borderRadius: 6, background: 'var(--lp-surface)', color: 'var(--lp-text)' };
