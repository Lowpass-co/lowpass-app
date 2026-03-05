/* ============================================
   LOWPASS — Routing Editor

   Holds routing state, view toggle (Grid/Calendar/Kanban),
   save to API. Builds date range from tour.
   ============================================ */

'use client';

import { useState, useEffect } from 'react';
import { LayoutGrid, Calendar, Columns, Download } from 'lucide-react';
import { RoutingGrid, type RoutingRow } from './RoutingGrid';
import { RoutingCalendar } from './RoutingCalendar';
import { RoutingKanban } from './RoutingKanban';
import type { DayType } from '@/types';

type ViewMode = 'grid' | 'calendar' | 'kanban';

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
  existing: { date: string; day_type: string; city: string; venue_name?: string; notes?: string }[]
): RoutingRow[] {
  const byDate = new Map(existing.map((r) => [r.date, r]));
  return dateRange(startDate, endDate).map((date) => {
    const ex = byDate.get(date);
    return {
      date,
      day_type: (ex?.day_type ?? 'show') as DayType,
      city: ex?.city ?? '',
      venue_name: ex?.venue_name ?? '',
      notes: ex?.notes ?? '',
    };
  });
}

export function RoutingEditor({
  tourId,
  startDate,
  endDate,
}: {
  tourId: string;
  startDate: string;
  endDate: string;
}) {
  const [rows, setRows] = useState<RoutingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState<ViewMode>('grid');

  useEffect(() => {
    fetch(`/api/tours/${tourId}/routing`)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setRows(buildInitialRows(startDate, endDate, list));
      })
      .catch(() => setRows(buildInitialRows(startDate, endDate, [])))
      .finally(() => setLoading(false));
  }, [tourId, startDate, endDate]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tours/${tourId}/routing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dates: rows.map((r) => ({
            date: r.date,
            day_type: r.day_type,
            city: r.city,
            venue_name: r.venue_name || null,
            notes: r.notes || null,
          })),
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      // could set error state
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-lp-border bg-lp-surface p-8 text-center text-lp-text-secondary">
        Loading routing…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-lg border border-lp-border p-1">
          {[
            { mode: 'grid' as ViewMode, label: 'Grid', icon: LayoutGrid },
            { mode: 'calendar' as ViewMode, label: 'Calendar', icon: Calendar },
            { mode: 'kanban' as ViewMode, label: 'Kanban', icon: Columns },
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
          <a
            href={`/api/tours/${tourId}/calendar/feed.ics`}
            className="flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
          >
            <Download size={16} />
            iCal feed
          </a>
          {view === 'grid' && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-lp-orange px-4 py-2 text-sm font-medium text-white hover:bg-lp-orange-hover disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save routing'}
            </button>
          )}
        </div>
      </div>

      {view === 'grid' && (
        <RoutingGrid rows={rows} onChange={setRows} />
      )}
      {view === 'calendar' && <RoutingCalendar rows={rows} />}
      {view === 'kanban' && <RoutingKanban rows={rows} />}
    </div>
  );
}
