/* ============================================
   LOWPASS — Routing Editor

   Holds routing state, view toggle (Grid/Calendar/Kanban),
   save to API. Builds date range from tour.
   ============================================ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Calendar, MapPin, Download, Copy, Check, X, ClipboardCheck, Calculator, LayoutDashboard } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { type RoutingRow } from './RoutingGrid';
import { RoutingLedger } from './RoutingLedger';
import { RoutingSettingsMenu } from './RoutingSettingsMenu';
import { RoutingCalendar } from './RoutingCalendar';
import { RoutingExportButton } from './RoutingExportButton';
import type { PrimaryTransit } from './RoutingMap';
import type { RoutingStatusByDate } from '@/server/operations/getRoutingDayStatus';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { RoutingLedgerSkeleton } from '@/components/ui/SurfaceSkeletons';

const RoutingMap = dynamic(() => import('./RoutingMap').then((m) => m.RoutingMap), { ssr: false });

type ViewMode = 'grid' | 'calendar' | 'map';

function AfterSaveModal({ tourId, onClose }: { tourId: string; onClose: () => void }) {
  const advanceDesc = 'Create or edit advance sheets for this tour.';
  const budgetDesc = 'Estimate costs and build the tour budget.';
  const dashboardDesc = 'Back to your overview and tour list.';
  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-lp-text mb-1">What next?</h3>
        <p className="text-sm text-lp-text-secondary mb-4">Choose where to go after saving routing.</p>
        <div className="space-y-3">
          <Link
            href={`/advance/${tourId}`}
            onClick={onClose}
            className="flex items-start gap-3 w-full rounded-xl border border-lp-border bg-lp-surface-hover p-4 text-left hover:border-lp-accent transition-all group"
            style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            <ClipboardCheck className="h-5 w-5 shrink-0 text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
            <div>
              <div className="font-medium text-lp-text">Build the Advance</div>
              <div className="text-sm text-lp-text-secondary mt-0.5">{advanceDesc}</div>
            </div>
          </Link>
          <Link
            href={`/budget?tour_id=${tourId}`}
            onClick={onClose}
            className="flex items-start gap-3 w-full rounded-xl border border-lp-border bg-lp-surface-hover p-4 text-left hover:border-lp-accent transition-all group"
            style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            <Calculator className="h-5 w-5 shrink-0 text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
            <div>
              <div className="font-medium text-lp-text">Build the Budget</div>
              <div className="text-sm text-lp-text-secondary mt-0.5">{budgetDesc}</div>
            </div>
          </Link>
          <Link
            href="/dashboard"
            onClick={onClose}
            className="flex items-start gap-3 w-full rounded-xl border border-lp-border bg-lp-surface-hover p-4 text-left hover:border-lp-accent transition-all group"
            style={{ transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)' }}
          >
            <LayoutDashboard className="h-5 w-5 shrink-0 text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
            <div>
              <div className="font-medium text-lp-text">Return to Dashboard</div>
              <div className="text-sm text-lp-text-secondary mt-0.5">{dashboardDesc}</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(start);
  const endDate = new Date(end);
  while (d <= endDate) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function buildInitialRows(
  startDate: string,
  endDate: string,
  existing: { date: string; day_type: string; city: string; country?: string; address?: string; venue_name?: string; venue_website?: string; venue_phone?: string; venue_capacity?: number; notes?: string; latitude?: number; longitude?: number; transport_to_next?: string; canonical_venue_id?: string | null }[]
): RoutingRow[] {
  const byDate = new Map(existing.map((r) => [r.date, r]));
  return dateRange(startDate, endDate).map((date) => {
    const ex = byDate.get(date);
    const hasVenue = !!(ex?.venue_name?.trim() || ex?.city?.trim());
    const dayType = ex?.day_type;
    const effectiveDayType = dayType === 'show' && !hasVenue ? '' : (dayType ?? '');
    return {
      date,
      day_type: effectiveDayType,
      city: ex?.city ?? '',
      country: ex?.country ?? '',
      address: ex?.address ?? '',
      venue_name: ex?.venue_name ?? '',
      venue_website: ex?.venue_website,
      venue_phone: ex?.venue_phone,
      venue_capacity: ex?.venue_capacity,
      notes: ex?.notes ?? '',
      latitude: ex?.latitude,
      longitude: ex?.longitude,
      transport_to_next: (ex?.transport_to_next as RoutingRow['transport_to_next']) ?? 'default',
      // Preserve the canonical link across the bulk delete+reinsert save.
      canonical_venue_id: ex?.canonical_venue_id ?? null,
    };
  });
}

export function RoutingEditor({
  tourId,
  startDate,
  endDate,
  initialCustomDayTypes = [],
  readOnly = false,
  statusByDate = {},
  initialRows,
}: {
  tourId: string;
  startDate: string;
  endDate: string;
  initialCustomDayTypes?: string[];
  /** Sprint 9 §5 — when true, suppresses the Save button and
   *  blocks updateRow + addCustomDayType writes. Used by the
   *  Operations Routing page when the caller has read but not
   *  write permission for operations.routing. Realtime sync +
   *  view toggle still work. */
  readOnly?: boolean;
  /** R2 — per-date status dots (advance · hotel · crew), derived once in the
   *  page loader (getRoutingDayStatus). Keyed by YYYY-MM-DD. */
  statusByDate?: RoutingStatusByDate;
  /** F-3(b) — the routing payload, ALREADY loaded by the server component.
   *
   *  The cold-load hang was here: the page queried `routing` server-side (for the
   *  fingerprint + status dots), then this editor threw that away and refetched
   *  the same rows over `/api/tours/[id]/routing` before it could paint — so the
   *  ledger sat behind a client round-trip on a cold lambda ("Loading routing…"
   *  for 28-70s). Seeding from the server render is the D1-6 rates-mirror pattern:
   *  paint immediately from what the server already had, and let anything genuinely
   *  client-side settle afterwards. */
  initialRows?: Parameters<typeof buildInitialRows>[2];
}) {
  // F-3(b) — first paint comes from the server payload when we have it. `loading`
  // starts false in that case, so the ledger renders on the server-rendered HTML's
  // first client pass instead of waiting on a fetch.
  const [rows, setRows] = useState<RoutingRow[]>(() =>
    initialRows ? buildInitialRows(startDate, endDate, initialRows) : [],
  );
  const [loading, setLoading] = useState(!initialRows);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [primaryTransit, setPrimaryTransit] = useState<PrimaryTransit>('bus_van');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [afterSaveMenuOpen, setAfterSaveMenuOpen] = useState(false);
  const [customDayTypes, setCustomDayTypes] = useState<string[]>(initialCustomDayTypes);
  const { showToast } = useToast();
  const [icalModalOpen, setIcalModalOpen] = useState(false);
  const [calendarToken, setCalendarToken] = useState<string | null>(null);
  const [icalLoading, setIcalLoading] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const hasUserEditedRef = useRef(false);
  const [advanceByDate, setAdvanceByDate] = useState<Record<string, { routing_id: string; status: string }>>({});

  // Part 2 — autosave. Now SAFE: the POST is an id-preserving reconcile (Part 1),
  // so a background save no longer cascade-wipes income/folders. Any user edit
  // debounces a silent save; `rowsRef` keeps the debounced call from capturing a
  // stale row set. scheduleAutosave is defined below (after saveRouting) and
  // reached via a ref to avoid a temporal-dead-zone reference from updateRow.
  const router = useRouter();
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef(false);
  const scheduleAutosaveRef = useRef<(() => void) | null>(null);
  const [autosave, setAutosave] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    setCustomDayTypes(initialCustomDayTypes);
  }, [initialCustomDayTypes]);

  const handleAddCustomDayType = useCallback(
    async (newType: string) => {
      if (readOnly) return;
      setCustomDayTypes((prev) => {
        const next = prev.includes(newType) ? prev : [...prev, newType];
        fetch(`/api/tours/${tourId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ custom_day_types: next }),
        }).catch(() => setCustomDayTypes((p) => p.filter((t) => t !== newType)));
        return next;
      });
    },
    [tourId, readOnly]
  );

  const updateRow = useCallback((index: number, updates: Partial<RoutingRow>) => {
    if (readOnly) return;
    hasUserEditedRef.current = true;
    setSaveError(null);
    setRows((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const row = prev[index];
      if (!row) return prev;
      const merged = { ...row, ...updates };
      if (updates.day_type === 'rehearsal' && index > 0) {
        const prevRow = prev[index - 1];
        if (prevRow) {
          const hasVenue = merged.venue_name != null && String(merged.venue_name).trim() !== '';
          const hasCity = merged.city != null && String(merged.city).trim() !== '';
          const hasAddress = merged.address != null && String(merged.address).trim() !== '';
          if (!hasVenue) merged.venue_name = prevRow.venue_name ?? '';
          if (!hasCity) merged.city = prevRow.city ?? '';
          if (!hasAddress) merged.address = prevRow.address ?? '';
          if (merged.latitude == null && prevRow.latitude != null) merged.latitude = prevRow.latitude;
          if (merged.longitude == null && prevRow.longitude != null) merged.longitude = prevRow.longitude;
        }
      }
      return prev.map((r, i) => (i === index ? merged : r));
    });
    scheduleAutosaveRef.current?.();
  }, [readOnly]);

  useEffect(() => {
    if (view !== 'grid' || !selectedDate || !gridWrapperRef.current) return;
    const el = gridWrapperRef.current.querySelector(`[data-routing-date="${selectedDate}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setSelectedDate(null);
  }, [view, selectedDate]);

  /* Sprint 9 §4 — refetch routing rows from the server. Used
     by the initial-load effect and by the realtime hook below
     when a collaborator's INSERT/UPDATE/DELETE arrives. */
  const refetchRouting = useCallback(() => {
    return fetch(`/api/tours/${tourId}/routing`)
      .then((res) => res.json())
      .then((data) => {
        // A1 — the default GET returns a bare array; accept a `{ routing }` wrap
        // too (the lite shape) so a future shape change can't silently blank the
        // grid. If it's neither, log the payload rather than swallowing it — the
        // empty-render regression went undiagnosed because this path failed quiet.
        type ExistingRows = Parameters<typeof buildInitialRows>[2];
        const wrapped = (data as { routing?: unknown } | null)?.routing;
        const list: ExistingRows = Array.isArray(data)
          ? (data as ExistingRows)
          : Array.isArray(wrapped)
            ? (wrapped as ExistingRows)
            : [];
        if (!Array.isArray(data) && !Array.isArray(wrapped)) {
          console.error('[RoutingEditor] routing GET returned a non-array payload:', data);
        }
        setRows(buildInitialRows(startDate, endDate, list));
      })
      .catch((e) => {
        console.error('[RoutingEditor] routing GET failed:', e);
        setRows(buildInitialRows(startDate, endDate, []));
      });
  }, [tourId, startDate, endDate]);

  // F-3(b) — when the server already seeded us, DON'T refetch on mount. The
  // realtime subscription below still picks up a collaborator's edits, and any
  // local edit round-trips through the autosave POST, so the only thing an extra
  // mount fetch bought was latency. Without a seed (legacy mounts) behave as before.
  const seededRef = useRef(!!initialRows);
  useEffect(() => {
    hasUserEditedRef.current = false;
    if (seededRef.current) {
      seededRef.current = false; // a later tourId change must refetch
      return;
    }
    void refetchRouting().finally(() => setLoading(false));
  }, [refetchRouting]);

  /* Sprint 9 §4 — realtime sync. When a collaborator edits a
     routing row for this tour in another tab/device, refetch.
     Suppresses the refetch if the local user is mid-edit
     (hasUserEditedRef) so we don't clobber unsaved keystrokes;
     they re-sync on the next event after Save flushes. */
  // Live-sync subscription (kept for cross-device updates). The connection status
  // is NOT surfaced here — the shell's top-right ConnectionIndicator is the single
  // Live pill; the per-surface one was redundant (revamp Phase 0).
  useRealtimeRows({
    table: 'routing',
    filterColumn: 'tour_id',
    filterValue: tourId,
    onChange: () => {
      if (hasUserEditedRef.current) return;
      void refetchRouting();
    },
  });

  useEffect(() => {
    fetch(`/api/tours/${tourId}/advance`)
      .then((res) => (res.ok ? res.json() : { dates: [] }))
      .then((j) => {
        const dates = (j.dates ?? []) as { routing_id: string; date: string; advance: { status: string } | null }[];
        const byDate: Record<string, { routing_id: string; status: string }> = {};
        dates.forEach((d) => {
          byDate[d.date] = { routing_id: d.routing_id, status: d.advance?.status ?? 'not_started' };
        });
        setAdvanceByDate(byDate);
      })
      .catch(() => setAdvanceByDate({}));
  }, [tourId]);

  /* The one persist path (id-preserving reconcile POST). `silent` = autosave
     (subtle pill, no after-save menu / toast, no audit-log row). Reads rowsRef so
     a debounced call always saves the latest rows; stable identity (no `rows`
     dep) so timers never go stale. */
  const saveRouting = useCallback(async (silent: boolean) => {
    setSaveError(null);
    if (silent) setAutosave('saving'); else setSaving(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          autosave: silent,
          dates: rowsRef.current.map((r) => ({
            date: r.date,
            day_type: r.day_type ?? '',
            city: r.city,
            country: r.country || null,
            address: r.address || null,
            venue_name: r.venue_name || null,
            venue_website: r.venue_website || null,
            venue_phone: r.venue_phone || null,
            venue_capacity: r.venue_capacity ?? null,
            notes: r.notes || null,
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            transport_to_next: r.transport_to_next ?? 'default',
            // place_id (transient, from a Places pick) resolves to a
            // canonical venue server-side; canonical_venue_id is the
            // round-tripped existing link to preserve when nothing was picked.
            place_id: r.place_id ?? null,
            canonical_venue_id: r.canonical_venue_id ?? null,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      pendingSaveRef.current = false;
      if (silent) setAutosave('saved');
      else { showToast('Routing saved'); setAfterSaveMenuOpen(true); }
    } catch {
      if (silent) setAutosave('error'); else setSaveError('Failed to save routing. Please try again.');
    } finally {
      if (!silent) setSaving(false);
    }
  }, [tourId, showToast]);


  /* Debounced autosave — called from every user edit path (via the ref). */
  const scheduleAutosave = useCallback(() => {
    if (readOnly) return;
    pendingSaveRef.current = true;
    setAutosave('pending');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void saveRouting(true); }, 800);
  }, [readOnly, saveRouting]);
  useEffect(() => { scheduleAutosaveRef.current = scheduleAutosave; }, [scheduleAutosave]);

  /* Flush a pending autosave NOW (before a hard navigation like Open advance). */
  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (pendingSaveRef.current) await saveRouting(true);
  }, [saveRouting]);

  /* Warn on tab-close / reload while a save is still pending or in flight. */
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSaveRef.current || saving) { e.preventDefault(); e.returnValue = ''; }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [saving]);

  if (loading) {
    // F-3a — the skeleton IS the frame (bordered, real 46px rows), so the old
    // boxed "Loading routing…" wrapper would double the border and centre-align
    // the rows. Render it bare.
    return <RoutingLedgerSkeleton />;
  }

  return (
    <div className="space-y-4">
      {saveError && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            border: '1px solid color-mix(in srgb, var(--color-lp-error) 32%, transparent)',
            background: 'color-mix(in srgb, var(--color-lp-error) 8%, transparent)',
            color: 'var(--color-lp-error)',
          }}
        >
          {saveError}
        </div>
      )}
      {afterSaveMenuOpen && (
        <AfterSaveModal
          tourId={tourId}
          onClose={() => setAfterSaveMenuOpen(false)}
        />
      )}
      {/* R4b defect 3 — ONE right-aligned row of quiet chips (mock `.hd .acts`:
          Calendar · Map · Export…). The boxed segmented control and the full-width
          "Primary mode of transit" row are gone; the view toggle joins the action
          chips and the transit selector moved into <RoutingSettingsMenu>. */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {[
          { mode: 'grid' as ViewMode, label: 'Ledger', icon: LayoutGrid },
          { mode: 'calendar' as ViewMode, label: 'Calendar', icon: Calendar },
          { mode: 'map' as ViewMode, label: 'Map', icon: MapPin },
        ].map(({ mode, label, icon: Icon }) => {
          const active = view === mode;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              aria-pressed={active}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors"
              style={{
                borderColor: active ? 'var(--lp-orange)' : 'var(--lp-border)',
                background: active ? 'color-mix(in srgb, var(--lp-orange) 8%, transparent)' : 'transparent',
                color: active ? 'var(--lp-text)' : 'var(--lp-text-secondary)',
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
        <span className="flex items-center gap-2">
          {view !== 'calendar' ? (
            <RoutingSettingsMenu primaryTransit={primaryTransit} onPrimaryTransitChange={setPrimaryTransit} />
          ) : null}
          <RoutingExportButton tourId={tourId} />
          <button
            type="button"
            onClick={async () => {
              setIcalModalOpen(true);
              setIcalLoading(true);
              setCalendarToken(null);
              try {
                const res = await fetch(`/api/tours/${tourId}`);
                if (res.ok) {
                  const tour = await res.json();
                  setCalendarToken((tour as { calendar_token?: string }).calendar_token ?? null);
                }
              } finally {
                setIcalLoading(false);
              }
            }}
            className="flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            <Download size={16} />
            iCal feed
          </button>
          {!readOnly && (view === 'grid' || view === 'calendar') && autosave !== 'idle' && (
            /* Design system §5 — autosave everywhere + SaveStatus pill; the
               explicit "Save routing" button is retired (edits persist on their
               own; nav guard + flush landed in the data-integrity pass). Dot +
               label, no glyph. */
            <span
              aria-live="polite"
              className="inline-flex items-center text-xs"
              style={{ gap: 6, color: 'var(--lp-text-tertiary)', minWidth: 72 }}
            >
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background:
                    autosave === 'error'
                      ? 'var(--color-lp-error)'
                      : autosave === 'saved'
                        ? 'var(--color-lp-status-complete)'
                        : 'var(--color-lp-warning)',
                }}
              />
              {autosave === 'pending' || autosave === 'saving'
                ? 'Saving…'
                : autosave === 'saved'
                  ? 'Saved'
                  : autosave === 'error'
                    ? 'Save failed'
                    : ''}
            </span>
          )}
          {readOnly ? (
            <span
              className="lp-label-caps"
              style={{
                padding: '6px 10px',
                fontSize: 'var(--lp-text-2xs)',
                color: 'var(--lp-text-tertiary)',
                background: 'var(--lp-panel)',
                border: '1px solid var(--lp-border-subtle)',
                borderRadius: 'var(--lp-radius-md)',
              }}
              title="You have read-only access to routing in this workspace."
            >
              Read-only
            </span>
          ) : null}
        </span>
      </div>

      {icalModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50" onClick={() => setIcalModalOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-lp-text">iCal feed</h3>
              <button type="button" onClick={() => setIcalModalOpen(false)} className="rounded p-1 text-lp-text-tertiary hover:text-lp-text hover:bg-lp-bg-tertiary">
                <X size={20} />
              </button>
            </div>
            {icalLoading ? (
              <p className="text-sm text-lp-text-tertiary">Loading…</p>
            ) : calendarToken ? (
              <div className="space-y-4">
                <p className="text-sm text-lp-text-secondary">Subscribe to get live updates when routing changes</p>
                {typeof window !== 'undefined' && (
                  <>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={`${window.location.origin}/api/tours/${tourId}/calendar/feed.ics?token=${calendarToken}`}
                        className="flex-1 rounded-lg border border-lp-border bg-lp-bg-tertiary px-3 py-2 text-sm text-lp-text"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          const url = `${window.location.origin}/api/tours/${tourId}/calendar/feed.ics?token=${calendarToken}`;
                          await navigator.clipboard.writeText(url);
                          setCopySuccess(true);
                          setTimeout(() => setCopySuccess(false), 2000);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
                      >
                        {copySuccess ? <Check size={16} /> : <Copy size={16} />}
                        {copySuccess ? 'Copied' : 'Copy URL'}
                      </button>
                    </div>
                    <div className="flex flex-col gap-2">
                      <a
                        href={`webcal://${window.location.host}/api/tours/${tourId}/calendar/feed.ics?token=${calendarToken}`}
                        className="flex items-center gap-2 text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
                      >
                        Subscribe in Apple Calendar →
                      </a>
                      <a
                        href={`${window.location.origin}/api/tours/${tourId}/calendar/feed.ics?token=${calendarToken}&download=true`}
                        className="flex items-center gap-2 text-sm font-medium text-lp-text-secondary hover:text-lp-text"
                      >
                        <Download size={16} />
                        Download .ics
                      </a>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-sm text-lp-text-tertiary">Could not load calendar link. Make sure you have access to this tour.</p>
            )}
          </div>
        </div>
      )}

      {view === 'grid' && (
        <>
          {/* R4b defect 3 — the full-width "Primary mode of transit" row is gone;
              the selector now lives in <RoutingSettingsMenu> in the action row, so
              the ledger starts directly under the chips. */}
          <div ref={gridWrapperRef}>
            {/* R2 — the ledger replaces the input-grid for the routing surface.
                <RoutingGrid> stays live for the tour-create slide-over's compact
                variant; this view uses the text-until-touched ledger. */}
            <RoutingLedger
              rows={rows}
              updateRow={updateRow}
              primaryTransit={primaryTransit}
              customDayTypes={customDayTypes}
              tourId={tourId}
              advanceByDate={advanceByDate}
              statusByDate={statusByDate}
              readOnly={readOnly}
              // Part 2 — flush a pending autosave before leaving for Advance so the
              // edit can't be discarded by the (soft) navigation.
              onOpenAdvance={(routingId) => {
                void flushSave().finally(() => router.push(`/advance/${tourId}/${routingId}`));
              }}
              onDeleteRow={(index) => {
                hasUserEditedRef.current = true;
                setSaveError(null);
                setRows((prev) => prev.filter((_, i) => i !== index));
                scheduleAutosaveRef.current?.();
              }}
            />
          </div>
        </>
      )}
      {view === 'calendar' && (
        <RoutingCalendar
          rows={rows}
          updateRow={updateRow}
          startDate={startDate}
          endDate={endDate}
          customDayTypes={customDayTypes}
          onAddCustomDayType={handleAddCustomDayType}
        />
      )}
      {view === 'map' && (
        <RoutingMap
          rows={rows}
          primaryTransit={primaryTransit}
          onSelectDate={(date) => {
            setSelectedDate(date);
            setView('grid');
          }}
        />
      )}
    </div>
  );
}
