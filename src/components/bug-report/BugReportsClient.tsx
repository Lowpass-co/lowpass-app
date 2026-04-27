/* ============================================
   LOWPASS — Bug Reports grid + detail panel

   Lists all bug reports. Filters (status, severity, search),
   screenshot thumbnails, and a slide-out panel to update
   status/severity/resolution notes.
   ============================================ */

'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bug as BugIcon,
  CheckCircle2,
  Eye,
  EyeOff,
  FolderDown,
  Image as ImageIcon,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { BrandedSelect } from '@/components/ui/BrandedSelect';
import { cn } from '@/lib/utils';
import {
  buildBundle,
  exportBundleToFolder,
  exportBundleToZip,
  isDirectoryPickerSupported,
  selectTopCritical,
  toPngBlob,
  type ExportProgress,
} from './bulk-export';
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
    ? `A screenshot was captured for this bug. The reporter will paste it into the chat as a second paste (via the "Copy screenshot" button). If it isn't attached, this signed URL is the fallback (expires in ~1h, and binary content isn't directly fetchable by the agent): ${report.screenshot_url}`
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

/**
 * Copy just the screenshot (as PNG) to the clipboard so the user can
 * paste it into the Cursor/Claude chat as an attachment. We keep text
 * and image on separate buttons because Cursor's paste handler picks
 * image and drops text when a ClipboardItem contains both.
 */
async function copyScreenshotToClipboard(screenshotUrl: string): Promise<boolean> {
  if (
    typeof ClipboardItem === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.clipboard?.write
  ) {
    return false;
  }
  try {
    const res = await fetch(screenshotUrl, { credentials: 'omit' });
    if (!res.ok) return false;
    const png = await toPngBlob(await res.blob());
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
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
  const [hideResolved, setHideResolved] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Detail panel slides in via CSS transform. We cache the last-selected
  // report so the panel can keep rendering content while sliding out.
  const [cachedReport, setCachedReport] = useState<BugReport | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkStatusTarget, setBulkStatusTarget] = useState<BugStatus>('in_progress');
  const [bulkApplying, setBulkApplying] = useState(false);
  const headerSelectAllRef = useRef<HTMLInputElement>(null);

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
      // "Hide resolved" is on by default and only filters when the user
      // hasn't explicitly picked a status (otherwise the status filter wins).
      if (hideResolved && statusFilter === 'all' && (r.status === 'resolved' || r.status === 'wont_fix')) {
        return false;
      }
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
  }, [reports, statusFilter, severityFilter, hideResolved, search]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someSelectedInFilter = filtered.some(r => selectedIds.has(r.id));

  useLayoutEffect(() => {
    const el = headerSelectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelectedInFilter && !allFilteredSelected;
  }, [someSelectedInFilter, allFilteredSelected]);

  const hiddenResolvedCount = useMemo(() => {
    if (!reports) return 0;
    return reports.filter(r => r.status === 'resolved' || r.status === 'wont_fix').length;
  }, [reports]);

  const counts = useMemo(() => {
    const out = {
      total: reports?.length ?? 0,
      open: 0,
      in_progress: 0,
      pending_testing: 0,
      resolved: 0,
      critical: 0,
    };
    for (const r of reports ?? []) {
      if (r.status === 'open') out.open += 1;
      if (r.status === 'in_progress') out.in_progress += 1;
      if (r.status === 'pending_testing') out.pending_testing += 1;
      if (r.status === 'resolved') out.resolved += 1;
      if (r.severity === 'critical' && r.status !== 'resolved' && r.status !== 'wont_fix') out.critical += 1;
    }
    return out;
  }, [reports]);

  // Keep cachedReport in sync with the current selection, and fire the
  // slide-in animation on the next frame so the transition actually runs.
  useEffect(() => {
    if (selectedId && reports) {
      const r = reports.find(x => x.id === selectedId);
      if (r) {
        setCachedReport(r);
        const raf = requestAnimationFrame(() => setPanelOpen(true));
        return () => cancelAnimationFrame(raf);
      }
    } else {
      setPanelOpen(false);
    }
  }, [selectedId, reports]);

  // Escape clears row selection first, then closes the detail panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedIds.size > 0) {
        setSelectedIds(new Set());
        return;
      }
      if (panelOpen) setSelectedId(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, selectedIds]);

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
      setSelectedIds(prev => {
        if (!prev.has(id)) return prev;
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    },
    []
  );

  const toggleRowSelected = useCallback((id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const toggleSelectAllFiltered = useCallback(() => {
    setSelectedIds(prev => {
      if (filtered.length === 0) return prev;
      const allOn = filtered.every(r => prev.has(r.id));
      const n = new Set(prev);
      for (const r of filtered) {
        if (allOn) n.delete(r.id);
        else n.add(r.id);
      }
      return n;
    });
  }, [filtered]);

  const clearRowSelection = useCallback(() => setSelectedIds(new Set()), []);

  const applyBulkStatus = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkApplying(true);
    setError(null);
    const status = bulkStatusTarget;
    const ids = [...selectedIds];
    try {
      const res = await fetch('/api/bug-reports/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Bulk update failed.');
        return;
      }
      setSelectedIds(new Set());
      await load(true);
    } catch {
      setError('Network error.');
    } finally {
      setBulkApplying(false);
    }
  }, [selectedIds, bulkStatusTarget, load]);

  const handleBulkExport = useCallback(async () => {
    if (exporting) return;
    if (!reports?.length) return;
    setExporting(true);
    setExportError(null);
    try {
      const top = selectTopCritical(reports, 10);
      if (top.length === 0) {
        setExportError(
          'No open bugs to export. Export includes Open status only; set reports to Open or add new ones.',
        );
        return;
      }

      const bundle = await buildBundle(top, setExportProgress);

      if (isDirectoryPickerSupported()) {
        try {
          await exportBundleToFolder(bundle, setExportProgress);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            return;
          }
          console.warn('[bulk-export] folder mode failed, falling back to zip', err);
          await exportBundleToZip(bundle, setExportProgress);
        }
      } else {
        await exportBundleToZip(bundle, setExportProgress);
      }

      const resps = await Promise.all(
        top.map(t =>
          fetch(`/api/bug-reports/${t.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'in_progress' }),
          })
        )
      );
      const failed = resps.filter(r => !r.ok);
      if (failed.length > 0) {
        setExportError(
          'Export completed, but some reports could not be set to In progress. Use Refresh, then set status manually if needed.',
        );
      }
      await load(true);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }, [exporting, reports, load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <StatCards counts={counts} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={statusFilter === 'pending_testing'}
          onClick={() => setStatusFilter(s => (s === 'pending_testing' ? 'all' : 'pending_testing'))}
          className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors"
          style={{
            backgroundColor: statusFilter === 'pending_testing' ? '#f59e0b26' : 'var(--lp-surface)',
            border: `1px solid ${
              statusFilter === 'pending_testing' ? '#f59e0b88' : 'var(--lp-border)'
            }`,
            color: statusFilter === 'pending_testing' ? '#f59e0b' : 'var(--lp-text)',
          }}
        >
          {statusFilter === 'pending_testing' ? 'Showing: to be tested' : 'Show to be tested'}
        </button>
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

        <BrandedSelect
          value={statusFilter}
          onChange={v => setStatusFilter(v as StatusFilter)}
          ariaLabel="Filter by status"
          minWidth={170}
          options={[
            { value: 'all', label: 'All status' },
            ...STATUS_ORDER.map(s => ({
              value: s,
              label: STATUS_META[s].label,
              color: STATUS_META[s].color,
            })),
          ]}
        />
        <BrandedSelect
          value={severityFilter}
          onChange={v => setSeverityFilter(v as SeverityFilter)}
          ariaLabel="Filter by severity"
          minWidth={170}
          options={[
            { value: 'all', label: 'All severity' },
            ...SEVERITY_ORDER.map(s => ({
              value: s,
              label: SEVERITY_META[s].label,
              color: SEVERITY_META[s].color,
            })),
          ]}
        />

        <button
          type="button"
          onClick={() => setHideResolved(v => !v)}
          aria-pressed={hideResolved}
          title={
            statusFilter !== 'all'
              ? 'Status filter is active — hide-resolved is paused'
              : hideResolved
                ? `Showing open work. ${hiddenResolvedCount} resolved / won't-fix hidden.`
                : 'Showing everything, including resolved.'
          }
          className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors"
          style={{
            backgroundColor: hideResolved ? '#FF45001a' : 'var(--lp-bg-secondary)',
            border: `1px solid ${hideResolved ? '#FF450055' : 'var(--lp-border)'}`,
            color: hideResolved ? 'var(--lp-orange)' : 'var(--lp-text)',
            opacity: statusFilter !== 'all' ? 0.55 : 1,
          }}
        >
          {hideResolved ? <EyeOff size={14} /> : <Eye size={14} />}
          Hide resolved
          {hideResolved && statusFilter === 'all' && hiddenResolvedCount > 0 && (
            <span
              className="ml-1 rounded-md px-1.5 text-[10px] font-bold"
              style={{
                backgroundColor: '#FF450033',
                color: '#FF4500',
              }}
            >
              {hiddenResolvedCount}
            </span>
          )}
        </button>

        <div className="flex-1" />
        <button
          type="button"
          onClick={handleBulkExport}
          disabled={exporting || !reports || reports.length === 0}
          className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
          style={{
            backgroundColor: 'var(--lp-bg-secondary)',
            border: '1px solid var(--lp-border)',
            color: 'var(--lp-text)',
          }}
          title={
            isDirectoryPickerSupported()
              ? 'Top 10 open bugs by severity, mark as In progress, pick a folder'
              : 'Top 10 open bugs by severity, mark as In progress, download ZIP'
          }
        >
          {exporting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <FolderDown size={14} />
          )}
          {exporting
            ? exportProgress
              ? `${exportProgress.stage === 'fetching' ? 'Fetching' : exportProgress.stage === 'writing' ? 'Writing' : 'Done'} ${exportProgress.current}/${exportProgress.total}`
              : 'Exporting…'
            : 'Export top 10'}
        </button>
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

      {exportError && (
        <div
          className="rounded-md border px-3 py-2 text-xs"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--color-lp-error) 10%, transparent)',
            borderColor: 'var(--color-lp-error)',
            color: 'var(--lp-text)',
          }}
        >
          <div className="font-semibold" style={{ color: 'var(--color-lp-error)' }}>
            Export failed
          </div>
          <div className="mt-0.5" style={{ color: 'var(--lp-text-secondary)' }}>
            {exportError}
          </div>
        </div>
      )}

      {error && (
        <div
          className="rounded-lg px-3 py-2 text-sm"
          style={{ backgroundColor: '#ef44441a', color: '#ef4444', border: '1px solid #ef444433' }}
        >
          {error}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
          style={{
            backgroundColor: 'var(--lp-surface)',
            borderColor: 'var(--lp-border)',
            color: 'var(--lp-text)',
          }}
        >
          <span className="text-sm font-semibold">
            {selectedIds.size} selected
          </span>
          <button
            type="button"
            onClick={clearRowSelection}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium"
            style={{ borderColor: 'var(--lp-border)', color: 'var(--lp-text-secondary)' }}
          >
            Clear
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--lp-text-tertiary)' }}>
              Set status to
            </span>
            <BrandedSelect
              value={bulkStatusTarget}
              onChange={v => setBulkStatusTarget(v as BugStatus)}
              ariaLabel="Bulk status"
              minWidth={180}
              options={STATUS_ORDER.map(s => ({
                value: s,
                label: STATUS_META[s].label,
                color: STATUS_META[s].color,
              }))}
            />
            <button
              type="button"
              disabled={bulkApplying}
              onClick={() => void applyBulkStatus()}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
              style={{
                backgroundColor: 'var(--lp-orange)',
                color: '#fff',
              }}
            >
              {bulkApplying ? <Loader2 size={14} className="animate-spin" /> : null}
              Apply
            </button>
          </div>
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
            gridTemplateColumns: '36px 80px minmax(0,1fr) 120px 120px 160px 160px 140px',
          }}
        >
          <div className="flex items-center justify-center">
            <input
              ref={headerSelectAllRef}
              type="checkbox"
              className="h-4 w-4 rounded border"
              style={{ borderColor: 'var(--lp-border)', accentColor: 'var(--lp-orange)' }}
              checked={allFilteredSelected}
              onChange={toggleSelectAllFiltered}
              disabled={filtered.length === 0}
              title="Select all visible rows"
              aria-label="Select all visible bug reports"
            />
          </div>
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
              <Row
                key={r.id}
                report={r}
                selected={selectedIds.has(r.id)}
                onToggleSelect={() => toggleRowSelected(r.id)}
                onClick={() => setSelectedId(r.id)}
              />
            ))
          )}
        </div>
      </div>

      <DetailPanel
        report={cachedReport}
        open={panelOpen}
        onClose={() => setSelectedId(null)}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onFullyClosed={() => setCachedReport(null)}
      />
    </div>
  );
}

function StatCards({
  counts,
}: {
  counts: {
    total: number;
    open: number;
    in_progress: number;
    pending_testing: number;
    resolved: number;
    critical: number;
  };
}) {
  const cards = [
    { label: 'Total', value: counts.total, color: 'var(--lp-text)' },
    { label: 'Open', value: counts.open, color: STATUS_META.open.color },
    { label: 'In progress', value: counts.in_progress, color: STATUS_META.in_progress.color },
    { label: 'Pending testing', value: counts.pending_testing, color: STATUS_META.pending_testing.color },
    { label: 'Critical', value: counts.critical, color: SEVERITY_META.critical.color },
    { label: 'Resolved', value: counts.resolved, color: STATUS_META.resolved.color },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
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

function Row({
  report,
  selected,
  onToggleSelect,
  onClick,
}: {
  report: BugReport;
  selected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
}) {
  const sev = SEVERITY_META[report.severity];
  const st = STATUS_META[report.status];
  const title = report.title || report.description.split('\n')[0].slice(0, 120);

  return (
    <div
      className="grid w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors"
      style={{
        borderColor: 'var(--lp-border-light)',
        gridTemplateColumns: '36px 80px minmax(0,1fr) 120px 120px 160px 160px 140px',
        backgroundColor: selected ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : undefined,
      }}
    >
      <div
        className="flex items-center justify-center"
        onClick={e => e.stopPropagation()}
        onKeyDown={e => e.stopPropagation()}
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded border"
          style={{ borderColor: 'var(--lp-border)', accentColor: 'var(--lp-orange)' }}
          checked={selected}
          onChange={onToggleSelect}
          onClick={e => e.stopPropagation()}
          aria-label={`Select: ${title}`}
        />
      </div>
    <button
      type="button"
      onClick={onClick}
      className="grid w-full min-w-0 cursor-pointer items-center gap-3 text-left"
      style={{
        gridColumn: '2 / -1',
        display: 'grid',
        gridTemplateColumns: '80px minmax(0,1fr) 120px 120px 160px 160px 140px',
      }}
      onMouseOver={e => {
        if (!selected) e.currentTarget.style.backgroundColor = 'var(--lp-surface-hover)';
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
    </div>
  );
}

function DetailPanel({
  report,
  open,
  onClose,
  onUpdate,
  onDelete,
  onFullyClosed,
}: {
  report: BugReport | null;
  open: boolean;
  onClose: () => void;
  onUpdate: (
    id: string,
    patch: Partial<Pick<BugReport, 'status' | 'severity' | 'title' | 'resolution_notes'>>
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onFullyClosed: () => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(report?.resolution_notes ?? '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [imageCopyState, setImageCopyState] = useState<'idle' | 'copied' | 'error'>(
    'idle',
  );
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setResolutionNotes(report?.resolution_notes ?? '');
    setNotesSaved(false);
    setCopyState('idle');
    setImageCopyState('idle');
  }, [report?.id, report?.resolution_notes]);

  const onSendToAgent = useCallback(async () => {
    if (!report) return;
    const ok = await copyToClipboard(buildRepairPrompt(report));
    setCopyState(ok ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 2500);
  }, [report]);

  const onCopyScreenshot = useCallback(async () => {
    if (!report?.screenshot_url) return;
    const ok = await copyScreenshotToClipboard(report.screenshot_url);
    setImageCopyState(ok ? 'copied' : 'error');
    setTimeout(() => setImageCopyState('idle'), 2500);
  }, [report]);

  // When the inner panel finishes its slide-out transition, tell the
  // parent it's safe to drop the cached report from memory.
  const onTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (e.target !== panelRef.current) return;
    if (e.propertyName !== 'transform') return;
    if (!open) onFullyClosed();
  };

  // Nothing to render at all (no report has ever been selected).
  if (!report) return null;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[102] flex justify-end transition-opacity duration-300 ease-out',
        open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      )}
      style={{ backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)' }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-hidden={!open}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        onTransitionEnd={onTransitionEnd}
        className={cn(
          'flex h-full w-full max-w-2xl flex-col overflow-hidden transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : 'translate-x-full'
        )}
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
            <BrandedSelect
              value={report.status}
              onChange={v => onUpdate(report.id, { status: v as BugStatus })}
              ariaLabel="Status"
              className="w-full"
              triggerClassName="w-full"
              options={STATUS_ORDER.map(s => ({
                value: s,
                label: STATUS_META[s].label,
                color: STATUS_META[s].color,
              }))}
            />
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onSendToAgent}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
              style={{
                backgroundColor:
                  copyState === 'copied' ? '#22c55e1a' : 'var(--lp-bg-secondary)',
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
              title="Copy the structured repair prompt. Paste it into the Cursor agent or claude.ai, then use 'Copy screenshot' for the image."
            >
              {copyState === 'copied' ? (
                <>
                  <CheckCircle2 size={12} />
                  Prompt copied — paste into Cursor
                </>
              ) : copyState === 'error' ? (
                <>
                  <AlertTriangle size={12} />
                  Copy failed
                </>
              ) : (
                <>
                  <Sparkles size={12} />
                  Copy prompt for Cursor / Claude
                </>
              )}
            </button>
            {report.screenshot_url ? (
              <button
                type="button"
                onClick={onCopyScreenshot}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold"
                style={{
                  backgroundColor:
                    imageCopyState === 'copied' ? '#22c55e1a' : 'var(--lp-bg-secondary)',
                  border: `1px solid ${
                    imageCopyState === 'copied'
                      ? '#22c55e55'
                      : imageCopyState === 'error'
                        ? '#ef444455'
                        : 'var(--lp-border)'
                  }`,
                  color:
                    imageCopyState === 'copied'
                      ? '#22c55e'
                      : imageCopyState === 'error'
                        ? '#ef4444'
                        : 'var(--lp-text)',
                }}
                title="Copy the screenshot to the clipboard as an image. Paste it into the same Cursor/Claude chat as a second paste."
              >
                {imageCopyState === 'copied' ? (
                  <>
                    <CheckCircle2 size={12} />
                    Screenshot copied — paste again
                  </>
                ) : imageCopyState === 'error' ? (
                  <>
                    <AlertTriangle size={12} />
                    Screenshot copy failed
                  </>
                ) : (
                  <>
                    <ImageIcon size={12} />
                    Copy screenshot
                  </>
                )}
              </button>
            ) : null}
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
