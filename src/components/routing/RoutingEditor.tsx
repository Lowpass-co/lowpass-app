/* ============================================
   LOWPASS — Routing Editor

   Holds routing state, view toggle (Grid/Calendar/Kanban),
   save to API. Builds date range from tour.
   ============================================ */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { LayoutGrid, Calendar, MapPin, Download, Copy, Check, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { RoutingGrid, type RoutingRow } from './RoutingGrid';
import { RoutingCalendar } from './RoutingCalendar';
import type { PrimaryTransit } from './RoutingMap';

const RoutingMap = dynamic(() => import('./RoutingMap').then((m) => m.RoutingMap), { ssr: false });

type ViewMode = 'grid' | 'calendar' | 'map';

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
  existing: { date: string; day_type: string; city: string; address?: string; venue_name?: string; notes?: string; latitude?: number; longitude?: number; transport_to_next?: string }[]
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
}: {
  tourId: string;
  startDate: string;
  endDate: string;
  initialCustomDayTypes?: string[];
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
    [tourId]
  );

  const updateRow = useCallback((index: number, updates: Partial<RoutingRow>) => {
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
  }, []);

  useEffect(() => {
    if (view !== 'grid' || !selectedDate || !gridWrapperRef.current) return;
    const el = gridWrapperRef.current.querySelector(`[data-routing-date="${selectedDate}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setSelectedDate(null);
  }, [view, selectedDate]);

  useEffect(() => {
    hasUserEditedRef.current = false;
    fetch(`/api/tours/${tourId}/routing`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(buildInitialRows(startDate, endDate, list));
      })
      .catch(() => setRows(buildInitialRows(startDate, endDate, [])))
      .finally(() => setLoading(false));
  }, [tourId, startDate, endDate]);

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
        <div className="rounded-xl border border-lp-border bg-lp-surface px-4 py-3 text-sm shadow-sm">
          <p className="mb-2 font-medium text-lp-text">What next?</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAfterSaveMenuOpen(false)}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-1.5 text-lp-text hover:bg-lp-surface-hover"
            >
              Stay on this page
            </button>
            <Link
              href="/tours"
              className="rounded-lg bg-lp-orange px-3 py-1.5 text-white hover:bg-lp-orange-hover"
            >
              Return to tours
            </Link>
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
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
          {(view === 'grid' || view === 'calendar') && (
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
            <select
              value={primaryTransit}
              onChange={(e) => setPrimaryTransit(e.target.value as PrimaryTransit)}
              className="rounded-xl border border-lp-border bg-lp-surface px-3 py-2 text-sm text-lp-text focus:border-lp-orange focus:outline-none focus:ring-2 focus:ring-lp-orange/20"
            >
              <option value="bus_van">Bus / Van (60 mph)</option>
              <option value="bus_trailer">Bus + Trailer (55 mph)</option>
              <option value="car">Car (Google drive time)</option>
              <option value="flight">Flight (est. time)</option>
            </select>
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
