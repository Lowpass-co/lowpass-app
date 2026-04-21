/* ============================================
   LOWPASS — Bug Reports grid + detail panel

   Lists all bug reports. Filters (status, severity, search),
   screenshot thumbnails, and a slide-out panel to update
   status/severity/resolution notes.
   ============================================ */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bug as BugIcon,
  CheckCircle2,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import {
  SEVERITY_META,
  SEVERITY_ORDER,
  STATUS_META,
  STATUS_ORDER,
  type BugReport,
  type BugSeverity,
  type BugStatus,
} from './types';

type StatusFilter = 'all' | BugStatus;
type SeverityFilter = 'all' | BugSeverity;

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/**
 * Build a markdown prompt the user can paste into the Cursor agent or Claude
 * web UI. Everything the agent needs to start triaging lives in the body:
 * severity, environment, screenshot URL (signed — expires in ~1h), etc.
 */
function buildRepairPrompt(report: BugReport): string {
  const summary = report.title?.trim() || report.description.split('\n')[0].slice(0, 200);
  const viewport =
    report.viewport_width && report.viewport_height
      ? `${report.viewport_width}×${report.viewport_height}`
      : '(unknown)';
  const reporter =
    report.reporter?.name || report.reporter?.email || '(unknown)';
  const screenshot = report.screenshot_url
    ? `${report.screenshot_url}\n\n(Signed URL — expires in about an hour. Refresh the bug-reports page to regenerate if it 403s.)`
    : '(no screenshot attached)';

  return `You are investigating a bug reported inside the Lowpass tour-management app.
Your job is to locate the root cause in the codebase and propose a minimal,
surgical fix. If the fix is obvious, implement it and tell me which files you changed.

## Summary
${summary}

## Severity
${SEVERITY_META[report.severity].label} (${report.severity})

## What happened
${report.description.trim() || '(no description)'}

## Steps to reproduce
${report.steps_to_reproduce?.trim() || '(not provided)'}

## Where it happened
- Page URL: ${report.page_url ?? '(unknown)'}
- Path: ${report.page_path ?? '(unknown)'}
- Browser: ${report.browser ?? '(unknown)'}
- OS: ${report.os ?? '(unknown)'}
- Viewport: ${viewport}
- Device pixel ratio: ${report.device_pixel_ratio ?? '(unknown)'}
- User agent: ${report.user_agent ?? '(unknown)'}

## Reporter
${reporter}

## Screenshot
${screenshot}

## What I want from you
1. Find the specific component / route / handler responsible.
2. Explain the likely cause in one short paragraph.
3. Propose the smallest change that fixes it.
4. Ask before touching anything outside that surface area.

Bug report ID: ${report.id}`;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to textarea fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={{
        backgroundColor: `${color}1a`,
        color,
        border: `1px solid ${color}33`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

export function BugReportsClient() {
  const [reports, setReports] = useState<BugReport[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const res = await fetch('/api/bug-reports', { cache: 'no-store' });
      const data = (await res.json().catch(() => ({}))) as { reports?: BugReport[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not load (${res.status}).`);
        if (!silent) setReports([]);
        return;
      }
      setReports(data.reports ?? []);
    } catch {
      setError('Network error.');
      if (!silent) setReports([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    const q = search.trim().toLowerCase();
    return reports.filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (q) {
        const hay = [
          r.title,
          r.description,
          r.page_path,
          r.page_url,
          r.reporter?.name,
          r.reporter?.email,
          r.browser,
          r.os,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reports, statusFilter, severityFilter, search]);

  const counts = useMemo(() => {
    const out = {
      total: reports?.length ?? 0,
      open: 0,
      in_progress: 0,
      resolved: 0,
      critical: 0,
    };
    for (const r of reports ?? []) {
      if (r.status === 'open') out.open += 1;
      if (r.status === 'in_progress') out.in_progress += 1;
      if (r.status === 'resolved') out.resolved += 1;
      if (r.severity === 'critical' && r.status !== 'resolved' && r.status !== 'wont_fix') out.critical += 1;
    }
    return out;
  }, [reports]);

  const selected = reports?.find(r => r.id === selectedId) ?? null;

  const onUpdate = useCallback(
    async (id: string, patch: Partial<Pick<BugReport, 'status' | 'severity' | 'title' | 'resolution_notes'>>) => {
      const res = await fetch(`/api/bug-reports/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as { report?: Partial<BugReport>; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Update failed.');
        return;
      }
      setReports(prev =>
        prev ? prev.map(r => (r.id === id ? { ...r, ...(data.report ?? patch) } as BugReport : r)) : prev
      );
    },
    []
  );

  const onDelete = useCallback(
    async (id: string) => {
      if (!confirm('Delete this bug report? This cannot be undone.')) return;
      const res = await fetch(`/api/bug-reports/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Delete failed.');
        return;
      }
      setReports(prev => (prev ? prev.filter(r => r.id !== id) : prev));
      setSelectedId(null);
    },
    []
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <StatCards counts={counts} />

      <div className="flex flex-wrap items-center gap-2">
        <div
          className="flex items-center gap-2 rounded-lg px-3"
          style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}
        >
          <Search size={14} style={{ color: 'var(--lp-text-tertiary)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, description, URL, reporter…"
            className="w-72 bg-transparent py-2 text-sm outline-none"
            style={{ color: 'var(--lp-text)' }}
          />
        </div>

        <SelectPill
          value={statusFilter}
          onChange={v => setStatusFilter(v as StatusFilter)}
          options={[
            { value: 'all', label: 'All status' },
            ...STATUS_ORDER.map(s => ({ value: s, label: STATUS_META[s].label })),
          ]}
        />
        <SelectPill
          value={severityFilter}
          onChange={v => setSeverityFilter(v as SeverityFilter)}
          options={[
            { value: 'all', label: 'All severity' },
            ...SEVERITY_ORDER.map(s => ({ value: s, label: SEVERITY_META[s].label })),
          ]}
        />

        <div className="flex-1" />
        <button
          type="button"
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--lp-bg-secondary)',
            border: '1px solid var(--lp-border)',
            color: 'var(--lp-text)',
          }}
        >
          {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: '#ef44441a', color: '#ef4444', border: '1px solid #ef444433' }}
        >
          {error}
        </div>
      )}

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl"
        style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
      >
        <div
          className="grid shrink-0 items-center gap-3 border-b px-4 py-3 text-[11px] font-bold uppercase tracking-wider"
          style={{
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text-tertiary)',
            gridTemplateColumns: '80px minmax(0,1fr) 120px 120px 160px 160px 140px',
          }}
        >
          <div>Shot</div>
          <div>Title / Description</div>
          <div>Severity</div>
          <div>Status</div>
          <div>Page</div>
          <div>Reporter</div>
          <div>Created</div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {loading ? (
            <div className="flex flex-1 items-center justify-center py-12" style={{ color: 'var(--lp-text-tertiary)' }}>
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="flex flex-1 flex-col items-center justify-center gap-2 py-12 text-sm"
              style={{ color: 'var(--lp-text-tertiary)' }}
            >
              <BugIcon size={24} />
              {reports && reports.length === 0
                ? 'No bug reports yet. Click the bug icon in the corner of any page to file one.'
                : 'No reports match your filters.'}
            </div>
          ) : (
            filtered.map(r => (
              <Row key={r.id} report={r} onClick={() => setSelectedId(r.id)} />
            ))
          )}
        </div>
      </div>

      {selected && (
        <DetailPanel
          report={selected}
          onClose={() => setSelectedId(null)}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

function StatCards({
  counts,
}: {
  counts: { total: number; open: number; in_progress: number; resolved: number; critical: number };
}) {
  const cards = [
    { label: 'Total', value: counts.total, color: 'var(--lp-text)' },
    { label: 'Open', value: counts.open, color: STATUS_META.open.color },
    { label: 'In progress', value: counts.in_progress, color: STATUS_META.in_progress.color },
    { label: 'Critical', value: counts.critical, color: SEVERITY_META.critical.color },
    { label: 'Resolved', value: counts.resolved, color: STATUS_META.resolved.color },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map(c => (
        <div
          key={c.label}
          className="rounded-xl px-4 py-3"
          style={{ backgroundColor: 'var(--lp-surface)', border: '1px solid var(--lp-border)' }}
        >
          <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--lp-text-tertiary)' }}>
            {c.label}
          </div>
          <div className="mt-1 text-2xl font-bold" style={{ color: c.color as string }}>
            {c.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function SelectPill({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className="rounded-lg px-3 py-2 text-sm outline-none"
      style={{
        backgroundColor: 'var(--lp-bg-secondary)',
        border: '1px solid var(--lp-border)',
        color: 'var(--lp-text)',
      }}
    >
      {options.map(o => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Row({ report, onClick }: { report: BugReport; onClick: () => void }) {
  const sev = SEVERITY_META[report.severity];
  const st = STATUS_META[report.status];
  const title = report.title || report.description.split('\n')[0].slice(0, 120);

  return (
    <button
      type="button"
      onClick={onClick}
      className="grid w-full cursor-pointer items-center gap-3 border-b px-4 py-3 text-left transition-colors"
      style={{
        borderColor: 'var(--lp-border-light)',
        gridTemplateColumns: '80px minmax(0,1fr) 120px 120px 160px 160px 140px',
      }}
      onMouseOver={e => {
        e.currentTarget.style.backgroundColor = 'var(--lp-surface-hover)';
      }}
      onMouseOut={e => {
        e.currentTarget.style.backgroundColor = '';
      }}
    >
      <div
        className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-md"
        style={{ backgroundColor: 'var(--lp-bg-secondary)', border: '1px solid var(--lp-border)' }}
      >
        {report.screenshot_url ? (
          <img src={report.screenshot_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageOff size={16} style={{ color: 'var(--lp-text-tertiary)' }} />
        )}
      </div>

      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" style={{ color: 'var(--lp-text)' }}>
          {title}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
          {report.description.replace(/\s+/g, ' ').slice(0, 160)}
        </p>
      </div>

      <Pill label={sev.label} color={sev.color} />
      <Pill label={st.label} color={st.color} />

      <div className="min-w-0 truncate text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
        {report.page_path ?? '—'}
      </div>

      <div className="min-w-0 truncate text-xs" style={{ color: 'var(--lp-text-secondary)' }}>
        {report.reporter?.name || report.reporter?.email || '—'}
      </div>

      <div className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
        {formatDate(report.created_at)}
      </div>
    </button>
  );
}

function DetailPanel({
  report,
  onClose,
  onUpdate,
  onDelete,
}: {
  report: BugReport;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<BugReport, 'status' | 'severity' | 'title' | 'resolution_notes'>>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(report.resolution_notes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');

  useEffect(() => {
    setResolutionNotes(report.resolution_notes ?? '');
    setNotesSaved(false);
    setCopyState('idle');
  }, [report.id, report.resolution_notes]);

  const onSendToAgent = useCallback(async () => {
    const ok = await copyToClipboard(buildRepairPrompt(report));
    setCopyState(ok ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 2000);
  }, [report]);

  return (
    <div
      className="fixed inset-0 z-[102] flex justify-end"
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden"
        style={{ backgroundColor: 'var(--lp-surface)', borderLeft: '1px solid var(--lp-border)' }}
      >
        <div
          className="flex items-start justify-between border-b px-5 py-4"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <div className="min-w-0 flex-1 pr-4">
            <div className="flex items-center gap-2">
              <Pill label={STATUS_META[report.status].label} color={STATUS_META[report.status].color} />
              <Pill label={SEVERITY_META[report.severity].label} color={SEVERITY_META[report.severity].color} />
            </div>
            <h2 className="mt-2 text-lg font-bold" style={{ color: 'var(--lp-text)' }}>
              {report.title || report.description.split('\n')[0].slice(0, 160)}
            </h2>
            <p className="mt-0.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              Reported {formatDate(report.created_at)}
              {report.reporter?.name || report.reporter?.email
                ? ` by ${report.reporter?.name || report.reporter?.email}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5"
            style={{ color: 'var(--lp-text-tertiary)' }}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5">
          <Field label="Status">
            <select
              value={report.status}
              onChange={e => onUpdate(report.id, { status: e.target.value as BugStatus })}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--lp-bg-secondary)',
                border: '1px solid var(--lp-border)',
                color: 'var(--lp-text)',
              }}
            >
              {STATUS_ORDER.map(s => (
                <option key={s} value={s}>
                  {STATUS_META[s].label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Severity">
            <div className="flex flex-wrap gap-1.5">
              {SEVERITY_ORDER.map(s => {
                const meta = SEVERITY_META[s];
                const active = report.severity === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onUpdate(report.id, { severity: s })}
                    className="flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
                    style={{
                      backgroundColor: active ? meta.color : 'var(--lp-bg-secondary)',
                      color: active ? '#fff' : 'var(--lp-text-secondary)',
                      border: `1px solid ${active ? meta.color : 'var(--lp-border)'}`,
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: active ? '#fff' : meta.color }}
                    />
                    {meta.label}
                  </button>
                );
              })}
            </div>
          </Field>

          {report.screenshot_url && (
            <Field label="Screenshot">
              <a
                href={report.screenshot_url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg"
                style={{ border: '1px solid var(--lp-border)' }}
              >
                <img src={report.screenshot_url} alt="Bug screenshot" className="block max-h-96 w-full object-contain" />
              </a>
            </Field>
          )}

          <Field label="Description">
            <p
              className="whitespace-pre-wrap text-sm leading-relaxed"
              style={{ color: 'var(--lp-text)' }}
            >
              {report.description}
            </p>
          </Field>

          {report.steps_to_reproduce && (
            <Field label="Steps to reproduce">
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{ color: 'var(--lp-text)' }}
              >
                {report.steps_to_reproduce}
              </p>
            </Field>
          )}

          <Field label="Resolution notes">
            <textarea
              rows={4}
              value={resolutionNotes}
              onChange={e => {
                setResolutionNotes(e.target.value);
                setNotesSaved(false);
              }}
              placeholder="Root cause, fix summary, follow-ups…"
              className="w-full resize-y rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--lp-bg-secondary)',
                border: '1px solid var(--lp-border)',
                color: 'var(--lp-text)',
              }}
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                disabled={notesSaving || (resolutionNotes ?? '') === (report.resolution_notes ?? '')}
                onClick={async () => {
                  setNotesSaving(true);
                  try {
                    await onUpdate(report.id, { resolution_notes: resolutionNotes });
                    setNotesSaved(true);
                  } finally {
                    setNotesSaving(false);
                  }
                }}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: '#FF4500' }}
              >
                {notesSaving && <Loader2 size={12} className="animate-spin" />}
                Save notes
              </button>
              {notesSaved && (
                <span className="inline-flex items-center gap-1 text-xs" style={{ color: '#22c55e' }}>
                  <CheckCircle2 size={12} /> Saved
                </span>
              )}
            </div>
          </Field>

          <Field label="Environment">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <MetaItem label="Page URL" value={report.page_url} link />
              <MetaItem label="Path" value={report.page_path} />
              <MetaItem label="Browser" value={report.browser} />
              <MetaItem label="OS" value={report.os} />
              <MetaItem
                label="Viewport"
                value={
                  report.viewport_width && report.viewport_height
                    ? `${report.viewport_width}×${report.viewport_height}`
                    : null
                }
              />
              <MetaItem
                label="DPR"
                value={report.device_pixel_ratio != null ? String(report.device_pixel_ratio) : null}
              />
              <div className="col-span-2">
                <MetaItem label="User agent" value={report.user_agent} />
              </div>
            </div>
          </Field>

          {report.resolved_at && (
            <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              <CheckCircle2 size={12} />
              Resolved {formatDate(report.resolved_at)}
            </p>
          )}
        </div>

        <div
          className="flex items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: 'var(--lp-border)' }}
        >
          <button
            type="button"
            onClick={() => onDelete(report.id)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ color: '#ef4444', border: '1px solid #ef444433' }}
          >
            <AlertTriangle size={12} />
            Delete
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSendToAgent}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor: copyState === 'copied' ? '#22c55e1a' : 'var(--lp-bg-secondary)',
                border: `1px solid ${
                  copyState === 'copied'
                    ? '#22c55e55'
                    : copyState === 'error'
                      ? '#ef444455'
                      : 'var(--lp-border)'
                }`,
                color:
                  copyState === 'copied'
                    ? '#22c55e'
                    : copyState === 'error'
                      ? '#ef4444'
                      : 'var(--lp-text)',
              }}
              title="Copy a structured repair prompt to your clipboard. Paste it into the Cursor agent or claude.ai."
            >
              {copyState === 'copied' ? (
                <>
                  <CheckCircle2 size={12} />
                  Copied — paste into Cursor
                </>
              ) : copyState === 'error' ? (
                <>
                  <AlertTriangle size={12} />
                  Copy failed
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Send to Cursor / Claude
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold"
              style={{
                backgroundColor: 'var(--lp-bg-secondary)',
                border: '1px solid var(--lp-border)',
                color: 'var(--lp-text)',
              }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        className="mb-1.5 text-[11px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--lp-text-tertiary)' }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function MetaItem({ label, value, link }: { label: string; value: string | null; link?: boolean }) {
  if (!value) {
    return (
      <div>
        <div style={{ color: 'var(--lp-text-tertiary)' }}>{label}</div>
        <div style={{ color: 'var(--lp-text-tertiary)' }}>—</div>
      </div>
    );
  }
  return (
    <div className="min-w-0">
      <div style={{ color: 'var(--lp-text-tertiary)' }}>{label}</div>
      {link ? (
        <a
          href={value}
          target="_blank"
          rel="noreferrer"
          className="block truncate underline"
          style={{ color: 'var(--lp-text)' }}
          title={value}
        >
          {value}
        </a>
      ) : (
        <div className="break-all" style={{ color: 'var(--lp-text)' }} title={value}>
          {value}
        </div>
      )}
    </div>
  );
}
