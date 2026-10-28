'use client';

/* ============================================
   LOWPASS — <ScheduleImportFlow> — the AI schedule import, end to end
   (Oct 2026 — Adam: "drop a tour book, a routing grid, etc … approve the AI
   decisions and make any changes to the import")

     1. ADD     drop / choose files (PDF, Excel/CSV, images, text) or paste
     2. READ    files go straight to storage (signed URL — Vercel caps bodies
                at 4.5 MB), then /api/import/schedule reads them with AI
     3. REVIEW  one row per date, each marked New / Changes / Already matches.
                Every cell is editable; a changed cell shows what it replaces
                with a "keep" link; low-confidence rows are flagged with the
                text the AI read. Tick what to import.
     4. APPLY   existing tour → /api/tours/[id]/routing/import (merge-only:
                never deletes, widens the tour dates if needed);
                new tour → hands the approved days back to the tour editor.

   Chrome-free: the Schedule page wraps it in <ScheduleImportModal>; the New
   tour modal renders it inline. The host owns "discard this import?" via
   onDirtyChange.
   ============================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import { useToast } from '@/components/ui/Toast';
import { aiCapMessage, detectAiCap } from '@/lib/ai/client';
import {
  diffDays,
  rangeToCover,
  toApplyDays,
  type ExistingDay,
  type ImportField,
  type ImportMeta,
  type ImportedDay,
  type ReviewRow,
} from '@/lib/import/scheduleImport';

export interface ScheduleImportResult {
  meta: ImportMeta;
  days: ImportedDay[];
}

export interface ScheduleImportFlowProps {
  /** 'existing': apply to tourId. 'new-tour': hand the days back via onUse. */
  mode: 'existing' | 'new-tour';
  tourId?: string;
  tourStart?: string | null;
  tourEnd?: string | null;
  /** The tour's current days (existing mode) — what the review compares to. */
  existing?: ExistingDay[];
  /** Files dropped on the page before the flow opened. */
  initialFiles?: File[];
  onApplied?: (r: { inserted: number; updated: number; tourDates: { start_date: string | null; end_date: string | null } | null }) => void;
  onUse?: (r: ScheduleImportResult) => void;
  onCancel: () => void;
  /** True once there's something to lose (reading / reviewing). */
  onDirtyChange?: (dirty: boolean) => void;
}

const ACCEPT = '.pdf,.xlsx,.xls,.xlsm,.csv,.ods,.txt,.tsv,image/jpeg,image/png,image/webp,image/gif';
const DAY_TYPES = ['show', 'festival', 'rehearsal', 'press', 'radio', 'tv', 'travel', 'off'];
const FIELD_LABEL: Record<ImportField, string> = {
  day_type: 'Day type',
  venue_name: 'Venue',
  city: 'City',
  country: 'Country',
  address: 'Address',
  notes: 'Notes',
};

function fmtDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
function fmtShort(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

type Stage = 'add' | 'reading' | 'review' | 'applying';
type Filter = 'all' | 'new' | 'changes' | 'same';

export function ScheduleImportFlow({
  mode,
  tourId,
  tourStart = null,
  tourEnd = null,
  existing = [],
  initialFiles = [],
  onApplied,
  onUse,
  onCancel,
  onDirtyChange,
}: ScheduleImportFlowProps) {
  const { showToast } = useToast();
  const [stage, setStage] = useState<Stage>('add');
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const [meta, setMeta] = useState<ImportMeta | null>(null);
  const [days, setDays] = useState<ImportedDay[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [kept, setKept] = useState<Record<string, ImportField[]>>({});
  const [filter, setFilter] = useState<Filter>('all');

  const dirty = stage === 'reading' || stage === 'review' || stage === 'applying';
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  // Leaving the page mid-review loses the AI's reading — say so.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  useEffect(() => {
    if (stage !== 'reading') return;
    const t0 = Date.now();
    const id = window.setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [stage]);

  const rows: ReviewRow[] = useMemo(() => diffDays(days, mode === 'existing' ? existing : []), [days, existing, mode]);
  const counts = useMemo(
    () => ({
      new: rows.filter((r) => r.status === 'new').length,
      changes: rows.filter((r) => r.status === 'changes').length,
      same: rows.filter((r) => r.status === 'same').length,
    }),
    [rows],
  );
  const chosen = rows.filter((r) => selected.has(r.day.date) && r.status !== 'same');
  const widen = mode === 'existing' ? rangeToCover(chosen.map((r) => r.day.date), tourStart, tourEnd) : { start: null, end: null };
  const shown = rows.filter((r) => (filter === 'all' ? r.status !== 'same' || counts.new + counts.changes === 0 : r.status === filter));

  /* ---- add ---- */
  const addFiles = (list: FileList | File[] | null) => {
    if (!list) return;
    const next = Array.from(list).filter((f) => f.size > 0);
    setFiles((prev) => [...prev, ...next].slice(0, 10));
    setError(null);
  };

  /* ---- read ---- */
  const read = useCallback(async () => {
    if (!files.length && !text.trim()) return;
    setError(null);
    setStage('reading');
    setElapsed(0);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      let paths: string[] = [];
      if (files.length) {
        const prep = await fetch('/api/import/schedule/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) }),
          signal: ac.signal,
        });
        const pj = (await prep.json().catch(() => null)) as { uploads?: Array<{ path: string; token: string }>; bucket?: string; error?: string } | null;
        if (!prep.ok || !pj?.uploads) throw new Error(pj?.error ?? `Upload failed (${prep.status})`);
        const sb = createClient();
        await Promise.all(
          pj.uploads.map(async (u, i) => {
            const { error: upErr } = await sb.storage.from(pj.bucket ?? 'tour-files').uploadToSignedUrl(u.path, u.token, files[i], {
              contentType: files[i].type || 'application/octet-stream',
            });
            if (upErr) throw new Error(`Couldn't upload ${files[i].name}: ${upErr.message}`);
          }),
        );
        paths = pj.uploads.map((u) => u.path);
      }
      const res = await fetch('/api/import/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, text: text.trim() || undefined, tour_id: tourId }),
        signal: ac.signal,
      });
      const cap = await detectAiCap(res);
      if (cap) throw new Error(aiCapMessage(cap));
      const j = (await res.json().catch(() => null)) as { meta?: ImportMeta; days?: ImportedDay[]; warnings?: string[]; error?: string } | null;
      if (!res.ok || !j?.days) throw new Error(j?.error ?? `Reading failed (${res.status})`);
      setMeta(j.meta ?? null);
      setDays(j.days);
      setWarnings(j.warnings ?? []);
      // Default: everything that changes something is ticked.
      const ex = mode === 'existing' ? existing : [];
      const review = diffDays(j.days, ex);
      setSelected(new Set(review.filter((r) => r.status !== 'same').map((r) => r.day.date)));
      setKept({});
      setFilter('all');
      setStage(j.days.length ? 'review' : 'add');
      if (!j.days.length) setError((j.warnings ?? [])[0] ?? 'No dated days were found in that.');
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') {
        setStage('add');
        return;
      }
      setError(e instanceof Error ? e.message : 'Reading failed');
      setStage('add');
    } finally {
      abortRef.current = null;
    }
  }, [files, text, tourId, mode, existing]);

  /* ---- review edits ---- */
  const editDay = (date: string, field: ImportField, value: string) =>
    setDays((prev) => prev.map((d) => (d.date === date ? { ...d, [field]: value } : d)));
  const toggleKeep = (date: string, field: ImportField) =>
    setKept((prev) => {
      const cur = new Set(prev[date] ?? []);
      if (cur.has(field)) cur.delete(field);
      else cur.add(field);
      return { ...prev, [date]: [...cur] };
    });
  const toggle = (date: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(date)) n.delete(date);
      else n.add(date);
      return n;
    });
  const allShownTicked = shown.length > 0 && shown.every((r) => r.status === 'same' || selected.has(r.day.date));
  const toggleAllShown = () =>
    setSelected((prev) => {
      const n = new Set(prev);
      for (const r of shown) {
        if (r.status === 'same') continue;
        if (allShownTicked) n.delete(r.day.date);
        else n.add(r.day.date);
      }
      return n;
    });

  /* ---- apply ---- */
  const apply = async () => {
    if (!chosen.length) return;
    if (mode === 'new-tour') {
      onUse?.({ meta: meta ?? { tourName: null, artistName: null, startDate: null, endDate: null }, days: chosen.map((r) => r.day) });
      return;
    }
    const payload = toApplyDays(chosen, kept);
    if (!payload.length) {
      showToast('Nothing to change — every ticked value is kept as it is.', 'error');
      return;
    }
    setStage('applying');
    try {
      const res = await fetch(`/api/tours/${tourId}/routing/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: payload }),
      });
      const j = (await res.json().catch(() => null)) as { inserted?: number; updated?: number; tourDates?: { start_date: string | null; end_date: string | null } | null; error?: string } | null;
      if (!res.ok) throw new Error(j?.error ?? `Import failed (${res.status})`);
      const inserted = j?.inserted ?? 0;
      const updated = j?.updated ?? 0;
      showToast(`Imported ${inserted + updated} ${inserted + updated === 1 ? 'day' : 'days'} (${inserted} new, ${updated} updated)`);
      setStage('add');
      onApplied?.({ inserted, updated, tourDates: j?.tourDates ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed');
      setStage('review');
    }
  };

  /* ---- styles ---- */
  const cellInput: React.CSSProperties = {
    width: '100%',
    minWidth: 0,
    padding: '5px 7px',
    fontSize: 'var(--lp-text-sm)',
    color: 'var(--lp-text)',
    background: 'var(--lp-bg)',
    border: '1px solid var(--lp-border)',
    borderRadius: 'var(--lp-radius-md)',
    outline: 'none',
  };
  const btn = (primary: boolean, enabled = true): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: 'var(--lp-space-2) var(--lp-space-4)',
    fontSize: 'var(--lp-text-sm)',
    fontWeight: primary ? 'var(--lp-weight-semibold)' : 'var(--lp-weight-medium)',
    color: primary ? (enabled ? 'var(--lp-text-inverse)' : 'var(--lp-text-tertiary)') : 'var(--lp-text-secondary)',
    background: primary ? (enabled ? 'var(--color-lp-orange)' : 'var(--lp-surface-hover)') : 'transparent',
    border: primary ? '1px solid transparent' : '1px solid var(--lp-border-strong)',
    borderRadius: 'var(--lp-radius-md)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  });
  const chip = (bg: string, fg: string): React.CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: 'var(--lp-radius-full)',
    padding: '2px 8px',
    fontSize: 'var(--lp-text-2xs)',
    fontWeight: 'var(--lp-weight-semibold)',
    background: bg,
    color: fg,
    whiteSpace: 'nowrap',
  });
  const STATUS_CHIP: Record<ReviewRow['status'], { label: string; style: React.CSSProperties }> = {
    new: { label: 'New', style: chip('color-mix(in srgb, var(--color-lp-status-complete) 15%, transparent)', 'var(--color-lp-status-complete)') },
    changes: { label: 'Changes', style: chip('color-mix(in srgb, var(--color-lp-status-needs-review) 15%, transparent)', 'var(--color-lp-status-needs-review)') },
    same: { label: 'Matches', style: chip('var(--lp-surface-hover)', 'var(--lp-text-tertiary)') },
  };

  const errorBox = error ? (
    <div role="alert" className="flex items-start gap-2 rounded-md px-3 py-2" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--color-lp-error)', background: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lp-error) 30%, transparent)' }}>
      <AlertTriangle size={14} style={{ marginTop: 3, flexShrink: 0 }} aria-hidden /> {error}
    </div>
  ) : null;

  /* ---- ADD ---- */
  if (stage === 'add') {
    return (
      <div className="flex flex-col gap-3" data-testid="import-add">
        {errorBox}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className="flex flex-col items-center justify-center gap-2 rounded-lg text-center"
          style={{
            padding: 'var(--lp-space-8) var(--lp-space-4)',
            border: `1.5px dashed ${dragging ? 'var(--lp-orange)' : 'var(--lp-border-strong)'}`,
            background: dragging ? 'color-mix(in srgb, var(--lp-orange) 6%, transparent)' : 'var(--lp-panel)',
          }}
        >
          <Upload size={22} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
          <div style={{ fontSize: 'var(--lp-text-md)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
            Drop a tour book, routing grid or itinerary
          </div>
          <div style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            PDF, Excel / CSV, a photo or screenshot, or text. The AI proposes the days — nothing changes until you approve.
          </div>
          <button type="button" onClick={() => fileInput.current?.click()} style={{ ...btn(false), marginTop: 6 }}>
            Choose files
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            accept={ACCEPT}
            aria-label="Choose files to import"
            style={{ display: 'none' }}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>
        {files.length ? (
          <ul className="flex flex-col gap-1" aria-label="Files to read">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-md px-3 py-2" style={{ background: 'var(--lp-panel)', border: '1px solid var(--lp-border)', fontSize: 'var(--lp-text-sm)' }}>
                <FileText size={14} aria-hidden style={{ color: 'var(--lp-text-tertiary)' }} />
                <span className="min-w-0 flex-1 truncate" style={{ color: 'var(--lp-text)' }}>{f.name}</span>
                <span className="tabular-nums" style={{ color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-xs)' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} style={{ border: 0, background: 'transparent', color: 'var(--lp-text-tertiary)', cursor: 'pointer' }}>
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <label style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-secondary)' }} htmlFor="import-paste">
          …or paste a schedule (an email, a spreadsheet selection)
        </label>
        <textarea
          id="import-paste"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'Fri 9 Oct — Roundhouse, London\nSat 10 Oct — Travel\nSun 11 Oct — O2 Ritz, Manchester'}
          style={{ ...cellInput, padding: 'var(--lp-space-2) var(--lp-space-3)', resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onCancel} style={btn(false)}>Cancel</button>
          <button type="button" onClick={() => void read()} disabled={!files.length && !text.trim()} style={btn(true, !!files.length || !!text.trim())}>
            <Sparkles size={14} aria-hidden /> Read with AI
          </button>
        </div>
      </div>
    );
  }

  /* ---- READING ---- */
  if (stage === 'reading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 text-center" style={{ padding: 'var(--lp-space-12) var(--lp-space-4)' }} data-testid="import-reading">
        <Loader2 size={26} className="animate-spin" aria-hidden style={{ color: 'var(--lp-orange)' }} />
        <div style={{ fontSize: 'var(--lp-text-md)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
          Reading {files.length ? `${files.length} ${files.length === 1 ? 'file' : 'files'}` : 'your text'} with AI…
        </div>
        <div className="tabular-nums" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
          {elapsed}s · a long tour book can take a minute or two
        </div>
        <button type="button" onClick={() => abortRef.current?.abort()} style={btn(false)}>Stop</button>
      </div>
    );
  }

  /* ---- REVIEW / APPLYING ---- */
  const applying = stage === 'applying';
  const filters: Array<{ id: Filter; label: string; n: number }> = [
    { id: 'all', label: 'To import', n: counts.new + counts.changes },
    { id: 'new', label: 'New', n: counts.new },
    { id: 'changes', label: 'Changes', n: counts.changes },
    { id: 'same', label: 'Already match', n: counts.same },
  ];

  return (
    <div className="flex flex-col gap-3" data-testid="import-review">
      {errorBox}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span style={{ fontSize: 'var(--lp-text-md)', fontWeight: 'var(--lp-weight-semibold)', color: 'var(--lp-text)' }}>
          Found {days.length} {days.length === 1 ? 'day' : 'days'}
          {meta?.tourName ? <span style={{ color: 'var(--lp-text-secondary)', fontWeight: 'var(--lp-weight-regular)' }}> · {meta.tourName}</span> : null}
        </span>
        {days.length ? (
          <span style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)' }}>
            {fmtShort(days[0].date)} – {fmtShort(days[days.length - 1].date)}
          </span>
        ) : null}
      </div>

      {warnings.length ? (
        <div className="rounded-md px-3 py-2" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text)', background: 'color-mix(in srgb, var(--color-lp-status-needs-review) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-lp-status-needs-review) 35%, transparent)' }}>
          <div className="mb-1 flex items-center gap-2" style={{ fontWeight: 'var(--lp-weight-semibold)' }}>
            <AlertTriangle size={14} aria-hidden style={{ color: 'var(--color-lp-status-needs-review)' }} /> Check these
          </div>
          <ul className="list-disc pl-5" style={{ color: 'var(--lp-text-secondary)' }}>
            {warnings.slice(0, 8).map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      {widen.start || widen.end ? (
        <div className="rounded-md px-3 py-2" style={{ fontSize: 'var(--lp-text-sm)', color: 'var(--lp-text-secondary)', background: 'var(--lp-panel)', border: '1px solid var(--lp-border)' }}>
          The tour runs {tourStart ? fmtShort(tourStart) : '—'} – {tourEnd ? fmtShort(tourEnd) : '—'}. Importing extends it to{' '}
          <strong style={{ color: 'var(--lp-text)' }}>{fmtShort(widen.start ?? tourStart ?? '')} – {fmtShort(widen.end ?? tourEnd ?? '')}</strong> so every day shows.
        </div>
      ) : null}

      <div role="tablist" aria-label="Filter days" className="flex flex-wrap gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            disabled={f.id !== 'all' && f.n === 0}
            style={{
              padding: '4px 10px',
              borderRadius: 'var(--lp-radius-full)',
              border: `1px solid ${filter === f.id ? 'var(--lp-orange)' : 'var(--lp-border)'}`,
              background: filter === f.id ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
              color: f.n === 0 && f.id !== 'all' ? 'var(--lp-text-tertiary)' : 'var(--lp-text)',
              fontSize: 'var(--lp-text-xs)',
              cursor: f.id !== 'all' && f.n === 0 ? 'default' : 'pointer',
            }}
          >
            {f.label} <span className="tabular-nums" style={{ color: 'var(--lp-text-tertiary)' }}>{f.n}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--lp-border)' }}>
        <table className="w-full border-collapse" style={{ minWidth: 980, fontSize: 'var(--lp-text-sm)' }}>
          <thead>
            <tr style={{ background: 'var(--lp-panel)', color: 'var(--lp-text-tertiary)', fontSize: 'var(--lp-text-2xs)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              <th style={{ width: 36, padding: '8px 10px', textAlign: 'left' }}>
                <input type="checkbox" aria-label="Tick all shown" checked={allShownTicked} onChange={toggleAllShown} disabled={applying} />
              </th>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: 150 }}>Date</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: 120 }}>Day type</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Venue</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: 130 }}>City</th>
              <th style={{ padding: '8px 6px', textAlign: 'left', width: 90 }}>Country</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Address</th>
              <th style={{ padding: '8px 6px', textAlign: 'left' }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const d = r.day;
              const ticked = selected.has(d.date);
              const keep = new Set(kept[d.date] ?? []);
              const change = (f: ImportField) => r.changes.find((c) => c.field === f);
              const cell = (f: ImportField) => {
                const c = change(f);
                const isKept = keep.has(f);
                const disabled = applying || r.status === 'same' || isKept;
                const value = isKept && c ? c.from : d[f];
                const input =
                  f === 'day_type' ? (
                    <select
                      aria-label={`${FIELD_LABEL[f]} for ${fmtDay(d.date)}`}
                      value={value}
                      disabled={disabled}
                      onChange={(e) => editDay(d.date, f, e.target.value)}
                      style={cellInput}
                    >
                      <option value="">—</option>
                      {[...new Set([...(value && !DAY_TYPES.includes(value) ? [value] : []), ...DAY_TYPES])].map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      aria-label={`${FIELD_LABEL[f]} for ${fmtDay(d.date)}`}
                      value={value}
                      disabled={disabled}
                      onChange={(e) => editDay(d.date, f, e.target.value)}
                      style={{ ...cellInput, opacity: isKept ? 0.6 : 1 }}
                    />
                  );
                return (
                  <td key={f} style={{ padding: '6px', verticalAlign: 'top' }}>
                    {input}
                    {c && r.status === 'changes' ? (
                      <div className="mt-1 flex items-center gap-1" style={{ fontSize: 'var(--lp-text-2xs)', color: 'var(--lp-text-tertiary)' }}>
                        {isKept ? (
                          <span>keeping current</span>
                        ) : (
                          <span className="truncate" title={c.from || '(empty)'}>
                            {f === 'notes' ? 'adds to current notes' : c.from ? <>replaces “{c.from}”</> : 'fills a blank'}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleKeep(d.date, f)}
                          disabled={applying}
                          style={{ border: 0, background: 'transparent', color: 'var(--lp-text-secondary)', textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 'inherit', flexShrink: 0 }}
                        >
                          {isKept ? 'use new' : 'keep'}
                        </button>
                      </div>
                    ) : null}
                  </td>
                );
              };
              return (
                <tr
                  key={d.date}
                  data-testid="import-row"
                  style={{ borderTop: '1px solid var(--lp-border-subtle)', opacity: ticked || r.status === 'same' ? 1 : 0.55 }}
                >
                  <td style={{ padding: '10px', verticalAlign: 'top' }}>
                    <input
                      type="checkbox"
                      aria-label={`Import ${fmtDay(d.date)}`}
                      checked={ticked && r.status !== 'same'}
                      disabled={r.status === 'same' || applying}
                      onChange={() => toggle(d.date)}
                    />
                  </td>
                  <td style={{ padding: '8px 6px', verticalAlign: 'top' }}>
                    <div className="tabular-nums" style={{ color: 'var(--lp-text)', whiteSpace: 'nowrap' }}>{fmtDay(d.date)}</div>
                    <div className="mt-1 flex items-center gap-1">
                      <span style={STATUS_CHIP[r.status].style}>{STATUS_CHIP[r.status].label}</span>
                      {d.confidence === 'low' ? (
                        <span
                          title={`The AI wasn't sure about this day.${d.source ? ` It read: “${d.source}”` : ''}`}
                          style={chip('color-mix(in srgb, var(--color-lp-status-needs-review) 15%, transparent)', 'var(--color-lp-status-needs-review)')}
                        >
                          Check
                        </span>
                      ) : null}
                    </div>
                  </td>
                  {cell('day_type')}
                  {cell('venue_name')}
                  {cell('city')}
                  {cell('country')}
                  {cell('address')}
                  {cell('notes')}
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={8} style={{ padding: 16, color: 'var(--lp-text-tertiary)' }}>Nothing in this view.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* Pinned to the bottom of the modal's scroll area, so the Import button
          is reachable without scrolling past a 40-day table. */}
      <div
        className="sticky -bottom-4 -mx-4 -mb-4 flex flex-wrap items-center justify-between gap-2 px-4 py-3"
        style={{ background: 'var(--lp-surface)', borderTop: '1px solid var(--lp-border)' }}
      >
        <button type="button" onClick={() => setStage('add')} disabled={applying} style={btn(false)}>
          ← Different files
        </button>
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-text-tertiary)' }}>
            {mode === 'existing' ? 'Adds and updates days — never deletes.' : 'You can still edit everything before creating the tour.'}
          </span>
          <button type="button" onClick={() => void apply()} disabled={!chosen.length || applying} style={btn(true, !!chosen.length && !applying)}>
            {applying ? <Loader2 size={14} className="animate-spin" aria-hidden /> : null}
            {mode === 'existing'
              ? `Import ${chosen.length} ${chosen.length === 1 ? 'day' : 'days'}`
              : `Use ${chosen.length} ${chosen.length === 1 ? 'day' : 'days'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
