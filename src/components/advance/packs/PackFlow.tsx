'use client';

/* ============================================
   <PackFlow> — fill a show's advance from venue info packs (Oct 2026).

     1. Drop one or many files. On the board, each is matched to its show
        (venue + date it names) and you can change the match.
     2. The AI reads them against the day's questions.
     3. Review, one question at a time: the pack sits beside it with the exact
        words highlighted. Accept / Skip / edit; "Keep mine" where it differs.
     4. What the packs didn't answer (answer now or ask the venue) and useful
        extras you didn't ask for (add to this day or the template).
     5. Save: the answers, where each came from, and the files, kept with the
        show. Several shows → the next one follows.
   Nothing is saved before step 5. Closing mid-way asks first.
   ============================================ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, FileUp, Check } from 'lucide-react';
import { createClient } from '@/lib/supabase-client';
import type { Extra, Suggestion } from '@/lib/advance/packs';
import { advanceCall, packFileUrl, saveAnswers } from '../api';
import { fmtDay } from '../format';
import { RequestFlow } from '../RequestFlow';
import { PackViewer } from './PackViewer';
import '../advance.css';

interface ShowLite { routingId: string; date: string; venue: string | null; city: string | null }
interface Uploaded { name: string; path: string; size: number; type: string }
interface FileInfo {
  path: string;
  name: string;
  kind: 'text' | 'pdf' | 'image' | null;
  mime: string | null;
  pageCount: number | null;
  error: string | null;
  found?: number;
  textPages?: { num: number; text: string }[] | null;
}
interface Extraction {
  files: FileInfo[];
  suggestions: Suggestion[];
  extras: Extra[];
  unanswered: { section_id: string; field_id: string; label: string; section: string; tmOnly: boolean }[];
  labels: Record<string, { section: string; label: string; type: string }>;
  existing: Record<string, unknown>;
  sections: { template_id: string; label: string }[];
}

type Stage = 'add' | 'reading' | 'match' | 'review' | 'gaps' | 'saved';
type Decision = { status: 'ok' | 'skip' | 'mine'; value: string };

const kk = (s: { section_id: string; field_id: string }) => `${s.section_id}:${s.field_id}`;
const show = (v: unknown) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : v == null ? '' : String(v));

export function PackFlow({
  tourId,
  initialFiles,
  shows,
  fixedRoutingId,
  onClose,
}: {
  tourId: string;
  initialFiles: File[];
  shows: ShowLite[];
  fixedRoutingId?: string;
  onClose: (saved?: boolean) => void;
}) {
  const [stage, setStage] = useState<Stage>(initialFiles.length ? 'reading' : 'add');
  const [files, setFiles] = useState<File[]>(initialFiles);
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<Record<number, { label: string; pct: number; done?: boolean; error?: string }>>({});
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);
  const uploadedRef = useRef<Uploaded[]>([]); // set with `uploaded`, read by extract()
  // What happened to each file, said once the read is back — a file that
  // couldn't be read, or had nothing for these questions, is never silent.
  const [notice, setNotice] = useState<string | null>(null);
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [qi, setQi] = useState(0);
  const [ex, setEx] = useState<Extraction | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [sel, setSel] = useState(0);
  const [dec, setDec] = useState<Record<string, Decision>>({});
  const [gaps, setGaps] = useState<Record<string, { mode: 'ask' | 'answer' | 'skip'; value: string }>>({});
  const [extras, setExtras] = useState<Record<number, 'day' | 'template' | 'ignore'>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [savedAny, setSavedAny] = useState(false);
  const started = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const routingId = queue[qi] ?? null;
  const current = shows.find((s) => s.routingId === routingId) ?? null;
  const dirty = stage === 'review' || stage === 'gaps' || stage === 'match';

  const close = useCallback(() => {
    if (dirty && !confirmClose) {
      setConfirmClose(true);
      return;
    }
    onClose(savedAny);
  }, [dirty, confirmClose, onClose, savedAny]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /* ---- 1. upload, then identify (board) or read (show) ---- */
  const extract = useCallback(
    async (rid: string, paths: string[]) => {
      setBusy(true);
      setError(null);
      setProgress((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v.error ? v : { label: 'Reading with AI…', pct: 60 }])));
      try {
        const out = await advanceCall<Extraction>(`/api/tours/${tourId}/advance/packs/read`, {
          method: 'POST',
          body: JSON.stringify({ mode: 'extract', routingId: rid, paths }),
        });
        // Per-file outcome on the file rows, then the honest summary.
        setProgress((p) => {
          const next = { ...p };
          for (const f of out.files) {
            const i = uploadedRef.current.findIndex((u) => u.path === f.path);
            if (i < 0) continue;
            next[i] = f.error
              ? { label: f.error, pct: 100, error: f.error }
              : { label: f.found ? `${f.found} answer${f.found === 1 ? '' : 's'} found` : 'Read — nothing for these questions', pct: 100, done: true };
          }
          return next;
        });
        const failed = out.files.filter((f) => f.error);
        const empty = out.files.filter((f) => !f.error && !f.found);
        const lines = [
          ...failed.map((f) => `Couldn’t read ${f.name}: ${f.error}`),
          ...(out.suggestions.length ? empty.map((f) => `${f.name} was read, but nothing in it answers these questions.`) : []),
        ];
        if (failed.length === out.files.length) {
          // Nothing was read: stay on the file list (each row says why) rather
          // than showing every question as "not in the packs".
          setError(lines.join(' '));
          setStage('reading');
          return;
        }
        if (!out.suggestions.length && empty.length) lines.push(`Read ${empty.map((f) => f.name).join(', ')}, but found nothing that answers these questions.`);
        setNotice(lines.length ? lines.join(' ') : null);
        setEx(out);
        const d: Record<string, Decision> = {};
        for (const s of out.suggestions) d[kk(s)] = { status: undefined as never, value: show(s.value) };
        setDec(d);
        const g: Record<string, { mode: 'ask' | 'answer' | 'skip'; value: string }> = {};
        for (const u of out.unanswered) g[kk(u)] = { mode: u.tmOnly ? 'skip' : 'ask', value: '' };
        setGaps(g);
        setExtras({});
        setSel(0);
        const signed: Record<string, string> = {};
        await Promise.all(
          out.files.filter((f) => !f.error && !f.textPages).map(async (f) => {
            try {
              signed[f.path] = (await packFileUrl(tourId, { path: f.path })).url;
            } catch {
              /* the viewer says it couldn't show it */
            }
          }),
        );
        setUrls((u) => ({ ...u, ...signed }));
        setStage(out.suggestions.length ? 'review' : 'gaps');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Couldn’t read the files');
        setStage('add');
      } finally {
        setBusy(false);
      }
    },
    [tourId],
  );

  const start = useCallback(
    async (list: File[]) => {
      setStage('reading');
      setError(null);
      setBusy(true);
      try {
        const prep = await advanceCall<{ uploads: { name: string; path: string; token: string }[]; bucket: string }>(
          `/api/tours/${tourId}/advance/packs/upload`,
          { method: 'POST', body: JSON.stringify({ files: list.map((f) => ({ name: f.name, size: f.size, type: f.type })) }) },
        );
        const sb = createClient();
        const ups: Uploaded[] = [];
        await Promise.all(
          prep.uploads.map(async (u, i) => {
            setProgress((p) => ({ ...p, [i]: { label: 'Uploading…', pct: 25 } }));
            const { error: upErr } = await sb.storage.from(prep.bucket).uploadToSignedUrl(u.path, u.token, list[i], { contentType: list[i].type || undefined });
            if (upErr) throw new Error(`Couldn’t upload ${list[i].name}`);
            ups[i] = { name: list[i].name, path: u.path, size: list[i].size, type: list[i].type };
            setProgress((p) => ({ ...p, [i]: { label: 'Uploaded', pct: 45 } }));
          }),
        );
        uploadedRef.current = ups;
        setUploaded(ups);
        if (fixedRoutingId) {
          setQueue([fixedRoutingId]);
          setAssign(Object.fromEntries(ups.map((u) => [u.path, fixedRoutingId])));
          return { mode: 'extract' as const, ups };
        }
        setProgress((p) => Object.fromEntries(Object.keys(p).map((k) => [k, { label: 'Finding the show…', pct: 55 }])));
        const id = await advanceCall<{ files: { path: string; routingId: string | null; error: string | null }[] }>(`/api/tours/${tourId}/advance/packs/read`, {
          method: 'POST',
          body: JSON.stringify({ mode: 'identify', paths: ups.map((u) => u.path) }),
        });
        const a: Record<string, string> = {};
        id.files.forEach((f) => f.routingId && (a[f.path] = f.routingId));
        setAssign(a);
        setProgress(Object.fromEntries(id.files.map((f, i) => [i, f.error ? { label: f.error, pct: 100, error: f.error } : { label: f.routingId ? 'Matched' : 'Pick the show', pct: 100, done: !!f.routingId }])));
        setStage('match');
        return { mode: 'match' as const, ups };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Couldn’t upload');
        setStage('add');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [tourId, fixedRoutingId],
  );

  useEffect(() => {
    if (started.current || !initialFiles.length) return;
    started.current = true;
    void start(initialFiles).then((r) => {
      if (r?.mode === 'extract' && fixedRoutingId) void extractFirst(fixedRoutingId, r.ups.map((u) => u.path));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // extract() closes over `uploaded`; for the very first run use the paths directly.
  const extractFirst = (rid: string, paths: string[]) => extract(rid, paths);

  const addFiles = (list: File[]) => {
    if (!list.length) return;
    setFiles(list);
    void start(list).then((r) => {
      if (r?.mode === 'extract' && fixedRoutingId) void extractFirst(fixedRoutingId, r.ups.map((u) => u.path));
    });
  };

  const beginReview = () => {
    const ids = [...new Set(Object.values(assign))].sort((a, b) => (shows.find((s) => s.routingId === a)?.date ?? '').localeCompare(shows.find((s) => s.routingId === b)?.date ?? ''));
    if (!ids.length) {
      setError('Pick which show each file is for.');
      return;
    }
    setQueue(ids);
    setQi(0);
    void extract(ids[0], uploaded.filter((u) => assign[u.path] === ids[0]).map((u) => u.path));
  };

  /* ---- 3. review ---- */
  const sugg = ex?.suggestions ?? [];
  const cur = sugg[sel] ?? null;
  const curKey = cur ? kk(cur) : '';
  const undecided = sugg.filter((s) => !dec[kk(s)]?.status);
  const decide = (status: Decision['status']) => {
    if (!cur) return;
    const nextDec = { ...dec, [curKey]: { ...dec[curKey], status } };
    setDec(nextDec);
    const after = sugg.findIndex((s, i) => i > sel && !nextDec[kk(s)]?.status);
    const any = sugg.findIndex((s) => !nextDec[kk(s)]?.status);
    if (after >= 0) setSel(after);
    else if (any >= 0) setSel(any);
    else setStage('gaps');
  };
  const acceptSure = () => {
    const nextDec = { ...dec };
    for (const s of sugg) {
      const k = kk(s);
      if (!nextDec[k]?.status && s.verified && s.confidence !== 'low' && !(k in (ex?.existing ?? {}))) nextDec[k] = { ...nextDec[k], status: 'ok' };
    }
    setDec(nextDec);
    const any = sugg.findIndex((s) => !nextDec[kk(s)]?.status);
    if (any >= 0) setSel(any);
    else setStage('gaps');
  };
  const sureCount = sugg.filter((s) => !dec[kk(s)]?.status && s.verified && s.confidence !== 'low' && !(kk(s) in (ex?.existing ?? {}))).length;

  useEffect(() => {
    if (stage !== 'review') return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'a' || e.key === 'A') decide('ok');
      else if (e.key === 's' || e.key === 'S') decide(cur && curKey in (ex?.existing ?? {}) ? 'mine' : 'skip');
      else if (e.key === 'ArrowDown') setSel((i) => Math.min(sugg.length - 1, i + 1));
      else if (e.key === 'ArrowUp') setSel((i) => Math.max(0, i - 1));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  /* ---- 5. save ---- */
  const save = async () => {
    if (!ex || !routingId) return;
    setBusy(true);
    setError(null);
    const showFiles = ex.files.filter((f) => !f.error);
    const index = (path: string) => showFiles.findIndex((f) => f.path === path);
    const answers = sugg
      .filter((s) => dec[kk(s)]?.status === 'ok')
      .map((s) => ({
        section_id: s.section_id,
        field_id: s.field_id,
        value: coerceBack(dec[kk(s)].value, s.value),
        file: index(ex.files[s.file]?.path ?? ''),
        page: s.page ?? undefined,
        quote: s.quote || undefined,
      }));
    const newQuestions = ex.extras
      .map((e, i) => ({ e, i }))
      .filter(({ i }) => extras[i] === 'day' || extras[i] === 'template')
      .map(({ e, i }) => ({ label: e.label, value: e.value, section_id: e.section_id ?? undefined, scope: extras[i], file: index(ex.files[e.file]?.path ?? ''), page: e.page ?? undefined, quote: e.quote || undefined }));
    try {
      await advanceCall(`/api/tours/${tourId}/advance/${routingId}/packs`, {
        method: 'POST',
        body: JSON.stringify({
          files: showFiles.map((f) => ({ path: f.path, name: f.name, mime: f.mime, size: uploaded.find((u) => u.path === f.path)?.size, pageCount: f.pageCount })),
          answers,
          newQuestions,
        }),
      });
      const typed: Record<string, Record<string, unknown>> = {};
      for (const [k, g] of Object.entries(gaps)) {
        if (g.mode !== 'answer' || !g.value.trim()) continue;
        const [sid, fid] = k.split(':');
        (typed[sid] ??= {})[fid] = g.value.trim();
      }
      if (Object.keys(typed).length) await saveAnswers(tourId, routingId, typed);
      setSavedAny(true);
      setStage('saved');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t save');
    } finally {
      setBusy(false);
    }
  };

  const nextShow = () => {
    if (qi + 1 >= queue.length) {
      onClose(true);
      return;
    }
    const rid = queue[qi + 1];
    setQi(qi + 1);
    void extract(rid, uploaded.filter((u) => assign[u.path] === rid).map((u) => u.path));
  };

  /* ---- viewer for the current suggestion ---- */
  const viewFile = cur ? ex?.files[cur.file] : ex?.files.find((f) => !f.error);
  const asks = Object.values(gaps).filter((g) => g.mode === 'ask').length;
  const accepted = sugg.filter((s) => dec[kk(s)]?.status === 'ok').length;
  const skipped = sugg.filter((s) => dec[kk(s)]?.status === 'skip' || dec[kk(s)]?.status === 'mine').length;
  const added = Object.values(extras).filter((x) => x === 'day' || x === 'template').length;

  const steps: { id: Stage; label: string; n?: number }[] = [
    { id: 'review', label: 'Suggested answers', n: undecided.length },
    { id: 'gaps', label: 'Not in the packs', n: ex?.unanswered.length },
    { id: 'gaps', label: 'Extra info found', n: ex?.extras.length },
    { id: 'saved', label: 'Save' },
  ];

  return (
    <div className="adv-sheet" role="dialog" aria-modal="true" aria-label="Fill from info packs">
      <header className="adv-sheet-head">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 'var(--lp-text-md)', fontWeight: 600 }}>Fill from info packs</div>
          <div className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
            {current ? `${fmtDay(current.date)} · ${current.venue ?? current.city ?? 'Show'}` : 'Drop venue packs'}
            {ex ? ` · ${ex.files.filter((f) => !f.error).length} ${ex.files.length === 1 ? 'file' : 'files'}` : ''}
            {queue.length > 1 ? ` · show ${qi + 1} of ${queue.length}` : ''}
          </div>
        </div>
        {ex && (stage === 'review' || stage === 'gaps' || stage === 'saved') ? (
          <nav aria-label="Steps" style={{ flex: 1, display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            {steps.map((s, i) => {
              const isCur = (stage === 'review' && i === 0) || (stage === 'gaps' && (i === 1 || i === 2)) || (stage === 'saved' && i === 3);
              const isDone = (stage !== 'review' && i === 0) || (stage === 'saved' && i < 3);
              return (
                <button
                  key={i}
                  type="button"
                  className="adv-step"
                  aria-current={isCur ? 'step' : undefined}
                  data-done={isDone && !isCur}
                  onClick={() => (i === 0 && stage === 'gaps' ? setStage('review') : null)}
                >
                  <b>{isDone && !isCur ? '✓' : i + 1}</b> {s.label} {s.n !== undefined ? <b>{s.n}</b> : null}
                </button>
              );
            })}
          </nav>
        ) : (
          <span className="adv-grow" />
        )}
        <button type="button" className="adv-btn adv-btn-ghost adv-btn-sm" aria-label="Close" onClick={close}>
          <X size={16} aria-hidden />
        </button>
      </header>

      {confirmClose ? (
        <div className="adv-banner" role="alertdialog" aria-label="Discard?" style={{ margin: '12px 20px 0' }}>
          <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>Close without saving? What you’ve reviewed for this show will be lost{savedAny ? ' (shows already saved stay saved)' : ''}.</span>
          <button type="button" className="adv-btn adv-btn-sm" onClick={() => setConfirmClose(false)}>Keep going</button>
          <button type="button" className="adv-btn adv-btn-sm" style={{ background: 'var(--color-lp-error)', borderColor: 'var(--color-lp-error)', color: 'var(--lp-text-inverse)' }} onClick={() => onClose(savedAny)}>
            Discard
          </button>
        </div>
      ) : null}
      {error ? <div className="adv-banner" style={{ margin: '12px 20px 0', fontSize: 'var(--lp-text-sm)' }}>{error}</div> : null}
      {notice && (stage === 'review' || stage === 'gaps') ? (
        <div className="adv-banner adv-banner-info" role="status" style={{ margin: '12px 20px 0', fontSize: 'var(--lp-text-sm)' }}>{notice}</div>
      ) : null}

      {/* ---- add / reading / match ---- */}
      {stage === 'add' || stage === 'reading' || stage === 'match' ? (
        <div className="adv-pane-enter" style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <div
            className="adv-drop"
            data-over={over}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              if (!busy) addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <FileUp size={32} aria-hidden style={{ color: 'var(--lp-orange)' }} />
            <div style={{ fontSize: 'var(--lp-text-lg)', fontWeight: 600 }}>Drop venue info packs</div>
            <div className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)', maxWidth: 560, lineHeight: 1.5 }}>
              Tech packs, hospitality sheets, site plans, emails saved as PDF — one or many. The AI suggests answers to every question; nothing is saved until you’ve been through them.
            </div>
            <input ref={fileInput} type="file" multiple hidden accept=".pdf,image/*,.xlsx,.xls,.csv,.txt" onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />
            <button type="button" className="adv-btn" disabled={busy} onClick={() => fileInput.current?.click()}>Choose files</button>
          </div>

          {files.length && stage !== 'add' ? (
            <section aria-label="Files" style={{ border: '1px solid var(--lp-border)', borderRadius: 12, background: 'var(--lp-surface)' }}>
              <div className="adv-row-flex" style={{ padding: '14px 16px' }}>
                <h2 className="adv-grow" style={{ margin: 0, fontSize: 'var(--lp-text-md)', fontWeight: 600 }}>
                  {stage === 'match' ? 'Which show is each file for?' : `Reading ${files.length} ${files.length === 1 ? 'file' : 'files'}`}
                </h2>
                {stage === 'match' ? <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>Matched by the venue and date in each file — change any that are wrong</span> : null}
              </div>
              {files.map((f, i) => {
                const u = uploaded[i];
                const pr = progress[i];
                return (
                  <div key={i} className="adv-file" style={{ ['--i' as string]: i }}>
                    <span className="adv-ficon">{(f.name.split('.').pop() ?? '').toUpperCase().slice(0, 4)}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 'var(--lp-text-base)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                      <span className="adv-muted" style={{ display: 'block', fontSize: 'var(--lp-text-xs)' }}>{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                    </span>
                    {stage === 'match' && u ? (
                      <label className="adv-label">
                        For
                        <select className="adv-field" value={assign[u.path] ?? ''} onChange={(e) => setAssign({ ...assign, [u.path]: e.target.value })}>
                          <option value="">Not for a show — skip it</option>
                          {shows.map((s) => (
                            <option key={s.routingId} value={s.routingId}>
                              {fmtDay(s.date)} · {s.venue ?? s.city ?? 'Show'}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{fixedRoutingId && current ? `${fmtDay(current.date)} · ${current.venue ?? ''}` : ''}</span>
                    )}
                    <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ fontSize: 'var(--lp-text-xs)', color: pr?.error ? 'var(--color-lp-error)' : pr?.done ? 'color-mix(in srgb, var(--color-lp-success) 60%, var(--lp-text))' : 'var(--lp-text-secondary)' }}>
                        {pr?.done ? '✓ ' : ''}{pr?.label ?? 'Waiting'}
                      </span>
                      <span className="adv-bar" data-done={!!pr?.done} data-busy={busy && !pr?.done && !pr?.error}>
                        <span style={{ width: `${pr?.pct ?? 0}%` }} />
                      </span>
                    </span>
                  </div>
                );
              })}
              {stage === 'match' ? (
                <div className="adv-row-flex" style={{ padding: '14px 16px', borderTop: '1px solid var(--lp-border)' }}>
                  <span className="adv-grow adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>You’ll review one show at a time.</span>
                  <button type="button" className="adv-btn adv-btn-ghost" onClick={() => onClose(false)}>Cancel</button>
                  <button type="button" className="adv-btn adv-btn-primary" disabled={busy} onClick={beginReview}>Start reviewing</button>
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      ) : null}

      {/* ---- review ---- */}
      {stage === 'review' && ex && cur ? (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <section className="adv-viewer" aria-label="Source document">
            <div className="adv-row-flex" style={{ gap: 4, padding: '10px 14px', borderBottom: '1px solid var(--lp-border-light)' }}>
              {ex.files.filter((f) => !f.error).map((f) => (
                <span key={f.path} className="adv-tab" aria-current={viewFile?.path === f.path} style={{ cursor: 'default', height: 30, fontSize: 'var(--lp-text-xs)' }}>
                  {f.name}
                </span>
              ))}
            </div>
            <PackViewer
              url={viewFile ? urls[viewFile.path] ?? null : null}
              kind={viewFile?.kind === 'image' ? 'image' : viewFile?.kind === 'text' && viewFile.textPages ? 'text' : 'pdf'}
              page={cur.page}
              quote={cur.quote || null}
              label={ex.labels[curKey]?.label ?? null}
              textPages={viewFile?.textPages ?? undefined}
            />
          </section>

          <section aria-label="Suggested answers" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div key={curKey} className="adv-pane-enter" style={{ padding: '18px 22px', borderBottom: '1px solid var(--lp-border)', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--lp-surface)' }}>
              <div className="adv-row-flex" style={{ gap: 10 }}>
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{ex.labels[curKey]?.section}</span>
                {cur.confidence === 'low' || !cur.verified ? <span className="adv-pill adv-pill-check">Check</span> : null}
                <span className="adv-grow" />
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{sugg.length - undecided.length} of {sugg.length} done</span>
              </div>
              <label htmlFor="pack-ans" style={{ fontSize: 'var(--lp-text-xl)', fontWeight: 600 }}>{ex.labels[curKey]?.label}</label>
              {curKey in ex.existing ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '10px 12px', borderRadius: 8, background: 'var(--lp-surface-hover)', border: '1px solid var(--lp-border)' }}>
                  <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>You already have</span>
                  <span style={{ fontSize: 'var(--lp-text-base)' }}>{show(ex.existing[curKey])}</span>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontSize: 'var(--lp-text-xs)', color: 'var(--lp-orange)' }}>From the pack — edit it if you like</span>
                <input
                  id="pack-ans"
                  className="adv-field"
                  style={{ height: 42, fontSize: 'var(--lp-text-base)' }}
                  value={dec[curKey]?.value ?? ''}
                  onChange={(e) => setDec({ ...dec, [curKey]: { ...dec[curKey], value: e.target.value } })}
                />
                <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>
                  {ex.files[cur.file]?.name}
                  {cur.page ? `, page ${cur.page}` : ''}
                  {cur.verified ? ' · highlighted on the left' : ' · couldn’t find the exact words — check the page'}
                </span>
              </div>
              <div className="adv-row-flex" style={{ gap: 8 }}>
                {curKey in ex.existing ? (
                  <>
                    <button type="button" className="adv-btn adv-btn-light" onClick={() => decide('ok')}>Use the pack’s <span className="adv-kbd">A</span></button>
                    <button type="button" className="adv-btn" onClick={() => decide('mine')}>Keep mine <span className="adv-kbd">S</span></button>
                  </>
                ) : (
                  <>
                    <button type="button" className="adv-btn adv-btn-light" onClick={() => decide('ok')}>Accept <span className="adv-kbd">A</span></button>
                    <button type="button" className="adv-btn" onClick={() => decide('skip')}>Skip <span className="adv-kbd">S</span></button>
                  </>
                )}
                <span className="adv-grow" />
                {sureCount ? (
                  <button type="button" className="adv-btn adv-btn-ghost" onClick={acceptSure}>Accept all sure ones ({sureCount})</button>
                ) : (
                  <button type="button" className="adv-btn adv-btn-ghost" onClick={() => setStage('gaps')}>Next step →</button>
                )}
              </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
              {sugg.map((s, i) => {
                const k = kk(s);
                const d = dec[k]?.status;
                const head = i === 0 || ex.labels[kk(sugg[i - 1])]?.section !== ex.labels[k]?.section ? ex.labels[k]?.section : null;
                return (
                  <div key={k}>
                    {head ? <div style={{ padding: '12px 14px 6px', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--lp-text-tertiary)', fontWeight: 600, borderTop: '1px solid var(--lp-border-light)' }}>{head}</div> : null}
                    <button type="button" className="adv-sugg" aria-current={i === sel} onClick={() => setSel(i)}>
                      <span style={{ fontWeight: 700, textAlign: 'center', color: d === 'ok' ? 'color-mix(in srgb, var(--color-lp-success) 60%, var(--lp-text))' : d ? 'var(--lp-text-tertiary)' : i === sel ? 'var(--lp-orange)' : k in ex.existing ? 'var(--color-lp-warning)' : 'var(--lp-text-tertiary)' }} aria-hidden>
                        {d === 'ok' ? '✓' : d ? '–' : i === sel ? '●' : k in ex.existing ? '≠' : s.confidence === 'low' || !s.verified ? '!' : '○'}
                      </span>
                      <span style={{ color: 'var(--lp-text-secondary)' }}>{ex.labels[k]?.label}</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: d && d !== 'ok' ? 'var(--lp-text-tertiary)' : 'var(--lp-text)' }}>{dec[k]?.value}</span>
                      <span className="adv-mono" style={{ fontSize: 11.5, color: 'var(--lp-text-tertiary)', textAlign: 'right' }}>{s.page ? `p.${s.page}` : ''}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {/* ---- gaps + extras ---- */}
      {stage === 'gaps' && ex ? (
        <div className="adv-pane-enter" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '22px 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 20, alignItems: 'start' }}>
          <section style={{ border: '1px solid var(--lp-border)', borderRadius: 12, background: 'var(--lp-surface)' }} aria-label="Not in the packs">
            <div style={{ padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 'var(--lp-text-md)', fontWeight: 600 }}>Your questions the packs didn’t answer</h2>
              <p className="adv-sub" style={{ margin: '4px 0 0' }}>Answer them now, or they go into a short request to the venue.</p>
            </div>
            {ex.unanswered.length === 0 ? <div className="adv-muted" style={{ padding: '0 16px 16px', fontSize: 'var(--lp-text-sm)' }}>Nothing — the packs covered every question.</div> : null}
            {ex.unanswered.map((u) => {
              const k = kk(u);
              const g = gaps[k] ?? { mode: 'ask', value: '' };
              return (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '11px 16px', borderTop: '1px solid var(--lp-border-light)' }}>
                  <div className="adv-row-flex" style={{ gap: 12 }}>
                    <span className="adv-grow">
                      <span style={{ display: 'block', fontSize: 'var(--lp-text-base)' }}>{u.label}</span>
                      <span className="adv-muted" style={{ fontSize: 'var(--lp-text-xs)' }}>{u.section}{u.tmOnly ? ' · only you' : ''}</span>
                    </span>
                    <button type="button" className="adv-btn adv-btn-sm" aria-pressed={g.mode === 'answer'} style={g.mode === 'answer' ? { borderColor: 'var(--lp-orange)' } : undefined} onClick={() => setGaps({ ...gaps, [k]: { ...g, mode: 'answer' } })}>Answer</button>
                    {u.tmOnly ? (
                      <button type="button" className="adv-btn adv-btn-sm" disabled>Not sent to venues</button>
                    ) : (
                      <button type="button" className="adv-btn adv-btn-sm" aria-pressed={g.mode === 'ask'} style={g.mode === 'ask' ? { background: 'color-mix(in srgb, var(--color-lp-info) 15%, transparent)', borderColor: 'var(--color-lp-info)' } : undefined} onClick={() => setGaps({ ...gaps, [k]: { ...g, mode: g.mode === 'ask' ? 'skip' : 'ask' } })}>
                        {g.mode === 'ask' ? '✓ Ask venue' : 'Ask venue'}
                      </button>
                    )}
                  </div>
                  {g.mode === 'answer' ? (
                    <input className="adv-field" autoFocus aria-label={u.label} value={g.value} onChange={(e) => setGaps({ ...gaps, [k]: { ...g, value: e.target.value } })} placeholder="Your answer" />
                  ) : null}
                </div>
              );
            })}
          </section>

          <section style={{ border: '1px solid var(--lp-border)', borderRadius: 12, background: 'var(--lp-surface)' }} aria-label="Extra info found">
            <div style={{ padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 'var(--lp-text-md)', fontWeight: 600 }}>Useful info you didn’t ask for</h2>
              <p className="adv-sub" style={{ margin: '4px 0 0' }}>Add it as a question with this answer — for this day, or for every day on the template.</p>
            </div>
            {ex.extras.length === 0 ? <div className="adv-muted" style={{ padding: '0 16px 16px', fontSize: 'var(--lp-text-sm)' }}>Nothing extra in these files.</div> : null}
            {ex.extras.map((e, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '14px 16px', borderTop: '1px solid var(--lp-border-light)' }}>
                <div className="adv-row-flex" style={{ gap: 10 }}>
                  <span className="adv-grow" style={{ fontSize: 'var(--lp-text-base)', fontWeight: 600 }}>{e.label}</span>
                  <span className="adv-tag adv-mono">{ex.files[e.file]?.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 18)}{e.page ? ` p.${e.page}` : ''}</span>
                </div>
                <span style={{ fontSize: 'var(--lp-text-sm)' }}>{e.value}</span>
                <span className="adv-row-flex" style={{ gap: 6 }}>
                  {(['day', 'template', 'ignore'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className="adv-btn adv-btn-sm"
                      aria-pressed={extras[i] === m}
                      style={extras[i] === m && m !== 'ignore' ? { background: 'color-mix(in srgb, var(--color-lp-info) 15%, transparent)', borderColor: 'var(--color-lp-info)' } : m === 'ignore' ? { background: 'transparent' } : undefined}
                      onClick={() => setExtras({ ...extras, [i]: extras[i] === m ? 'ignore' : m })}
                    >
                      {extras[i] === m && m !== 'ignore' ? '✓ ' : ''}
                      {m === 'day' ? 'Add to this day' : m === 'template' ? 'Add to the template' : 'Ignore'}
                    </button>
                  ))}
                </span>
              </div>
            ))}
          </section>
        </div>
      ) : null}

      {/* ---- saved ---- */}
      {stage === 'saved' ? (
        <div className="adv-pane-enter" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center', maxWidth: 520 }}>
            <span style={{ width: 52, height: 52, borderRadius: '50%', background: 'color-mix(in srgb, var(--color-lp-success) 18%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={26} aria-hidden style={{ color: 'var(--color-lp-success)' }} />
            </span>
            <div style={{ fontSize: 'var(--lp-text-xl)', fontWeight: 600 }}>Saved to {current?.venue ?? 'the show'}</div>
            <div className="adv-muted" style={{ fontSize: 'var(--lp-text-sm)', lineHeight: 1.5 }}>
              {accepted} {accepted === 1 ? 'answer' : 'answers'}{added ? ` and ${added} new ${added === 1 ? 'question' : 'questions'}` : ''}. The files are kept with the show — open any answer to see where it came from.
            </div>
            <div className="adv-row-flex" style={{ gap: 8, justifyContent: 'center' }}>
              {asks && routingId ? (
                <button type="button" className="adv-btn" onClick={() => setAsking(routingId)}>Ask the venue for the {asks} missing</button>
              ) : null}
              <button type="button" className="adv-btn adv-btn-primary" onClick={nextShow}>
                {qi + 1 < queue.length ? `Next: ${shows.find((s) => s.routingId === queue[qi + 1])?.venue ?? 'next show'} →` : 'Done'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {stage === 'review' || stage === 'gaps' ? (
        <footer className="adv-row-flex" style={{ padding: '14px 22px', borderTop: '1px solid var(--lp-border)', background: 'var(--lp-surface)' }}>
          <span className="adv-grow" style={{ fontSize: 'var(--lp-text-sm)' }}>
            <b>{accepted} answers</b> · {skipped} skipped · <span style={{ color: 'color-mix(in srgb, var(--color-lp-info) 60%, var(--lp-text))' }}>{asks} to ask the venue</span> · {added} new {added === 1 ? 'question' : 'questions'}
          </span>
          {stage === 'gaps' && sugg.length ? <button type="button" className="adv-btn adv-btn-ghost" onClick={() => setStage('review')}>Back</button> : null}
          {stage === 'review' ? (
            <button type="button" className="adv-btn" onClick={() => setStage('gaps')}>Next step</button>
          ) : (
            <button type="button" className="adv-btn adv-btn-primary" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save to the advance'}
            </button>
          )}
        </footer>
      ) : null}

      {asking ? (
        <RequestFlow tourId={tourId} routingIds={[asking]} shows={shows} onClose={() => setAsking(null)} />
      ) : null}
    </div>
  );
}

/** Keep the AI's typed value when the text wasn't edited (true/false, numbers). */
function coerceBack(text: string, original: Suggestion['value']): Suggestion['value'] {
  if (typeof original === 'boolean') {
    if (/^(yes|y|true)$/i.test(text.trim())) return true;
    if (/^(no|n|false)$/i.test(text.trim())) return false;
    return text;
  }
  if (typeof original === 'number') {
    const n = Number(text.replace(/,/g, ''));
    return Number.isFinite(n) && text.trim() !== '' ? n : text;
  }
  return text;
}
