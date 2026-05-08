/* ============================================
   LOWPASS — Routing Editor

   Holds routing state, view toggle (Grid/Calendar/Kanban),
   save to API. Builds date range from tour.
   ============================================ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LayoutGrid, Calendar, MapPin, Download, Copy, Check, X, ClipboardCheck, Calculator, LayoutDashboard } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { StyledSelect } from '@/components/ui/StyledSelect';
import { RoutingGrid, type RoutingRow } from './RoutingGrid';
import { RoutingCalendar } from './RoutingCalendar';
import type { PrimaryTransit } from './RoutingMap';
import { useRealtimeRows } from '@/lib/realtime/useRealtimeRows';
import { RealtimeIndicator } from '@/components/realtime/RealtimeIndicator';

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
  existing: { date: string; day_type: string; city: string; address?: string; venue_name?: string; venue_website?: string; venue_phone?: string; venue_capacity?: number; notes?: string; latitude?: number; longitude?: number; transport_to_next?: string }[]
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
      address: ex?.address ?? '',
      venue_name: ex?.venue_name ?? '',
      venue_website: ex?.venue_website,
      venue_phone: ex?.venue_phone,
      venue_capacity: ex?.venue_capacity,
      notes: ex?.notes ?? '',
      latitude: ex?.latitude,
      longitude: ex?.longitude,
      transport_to_next: (ex?.transport_to_next as RoutingRow['transport_to_next']) ?? 'default',
    };
  });
}

export function RoutingEditor({
  tourId,
  startDate,
  endDate,
  initialCustomDayTypes = [],
  readOnly = false,
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
}) {
  const [rows, setRows] = useState<RoutingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');
  const [primaryTransit, setPrimaryTransit] = useState<PrimaryTransit>('bus_van');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
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
        const list = Array.isArray(data) ? data : [];
        setRows(buildInitialRows(startDate, endDate, list));
      })
      .catch(() => setRows(buildInitialRows(startDate, endDate, [])));
  }, [tourId, startDate, endDate]);

  useEffect(() => {
    hasUserEditedRef.current = false;
    void refetchRouting().finally(() => setLoading(false));
  }, [refetchRouting]);

  /* Sprint 9 §4 — realtime sync. When a collaborator edits a
     routing row for this tour in another tab/device, refetch.
     Suppresses the refetch if the local user is mid-edit
     (hasUserEditedRef) so we don't clobber unsaved keystrokes;
     they re-sync on the next event after Save flushes. */
  const { connected: realtimeConnected } = useRealtimeRows({
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

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: rows.map((r) => ({
            date: r.date,
            day_type: r.day_type ?? '',
            city: r.city,
            address: r.address || null,
            venue_name: r.venue_name || null,
            venue_website: r.venue_website || null,
            venue_phone: r.venue_phone || null,
            venue_capacity: r.venue_capacity ?? null,
            notes: r.notes || null,
            latitude: r.latitude ?? null,
            longitude: r.longitude ?? null,
            transport_to_next: r.transport_to_next ?? 'default',
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setSaveSuccess(true);
      showToast('Routing saved');
      setAfterSaveMenuOpen(true);
    } catch {
      setSaveError('Failed to save routing. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [tourId, rows, showToast]);

  if (loading) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-lp-text-secondary">
        Loading routing…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {saveError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400">
          {saveError}
        </div>
      )}
      {afterSaveMenuOpen && (
        <AfterSaveModal
          tourId={tourId}
          onClose={() => setAfterSaveMenuOpen(false)}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex rounded-lg border border-lp-border p-1">
            {[
              { mode: 'grid' as ViewMode, label: 'Grid', icon: LayoutGrid },
              { mode: 'calendar' as ViewMode, label: 'Calendar', icon: Calendar },
              { mode: 'map' as ViewMode, label: 'Map', icon: MapPin },
            ].map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  view === mode
                    ? 'bg-lp-orange text-white'
                    : 'text-lp-text-secondary hover:text-lp-text hover:bg-lp-surface-hover'
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          {/* Sprint 9 §4 — Realtime "Live" indicator. Surfaces
              the Supabase Realtime channel state so collaborators
              know if cross-device sync is wired up. Edits keep
              working offline; this is informational only. */}
          <RealtimeIndicator connected={realtimeConnected} />
        </div>
        <div className="flex items-center gap-2">
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
          {!readOnly && (view === 'grid' || view === 'calendar') && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
            >
              {saving ? (
                <>
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Saving…
                </>
              ) : (
                'Save routing'
              )}
            </button>
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
        </div>
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
          <div className="flex flex-wrap items-center gap-4">
            <span className="text-sm font-medium text-lp-text-secondary">Primary mode of transit</span>
            <StyledSelect<PrimaryTransit>
              value={primaryTransit}
              onChange={(v) => setPrimaryTransit(v)}
              options={[
                { value: 'bus_van', label: 'Bus (0.8× drive time)' },
                { value: 'van', label: 'Van (0.9× drive time)' },
                { value: 'bus_trailer', label: 'Bus + Trailer (0.85× drive time)' },
                { value: 'car', label: 'Car (Google drive time)' },
                { value: 'flight', label: 'Flight (est. time)' },
              ]}
              placeholder="Select transit"
            />
          </div>
          <div ref={gridWrapperRef}>
            <RoutingGrid
              rows={rows}
              onChange={setRows}
              updateRow={updateRow}
              primaryTransit={primaryTransit}
              customDayTypes={customDayTypes}
              onAddCustomDayType={handleAddCustomDayType}
              tourId={tourId}
              advanceByDate={advanceByDate}
              onDeleteRow={(index) => {
                hasUserEditedRef.current = true;
                setSaveError(null);
                setRows((prev) => prev.filter((_, i) => i !== index));
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
