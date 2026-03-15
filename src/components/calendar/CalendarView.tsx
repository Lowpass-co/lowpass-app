'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ClipboardList, Calculator, FileText, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type CalendarEvent = {
  date: string;
  tour_id: string;
  tour_name: string;
  artist_id?: string;
  artist_name: string;
  routing_id: string;
  venue_name: string | null;
  city: string;
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COLOURS = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#06B6D4', '#84CC16'];

export function CalendarView() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tours, setTours] = useState<{ id: string; name: string; artist_name: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTourIds, setSelectedTourIds] = useState<Set<string>>(new Set());
  const [selectedArtistIds, setSelectedArtistIds] = useState<Set<string>>(new Set());
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    fetch('/api/calendar/events')
      .then((r) => (r.ok ? r.json() : { events: [], tours: [] }))
      .then((data) => {
        setEvents(data.events ?? []);
        setTours(data.tours ?? []);
        const tourIds = new Set<string>((data.tours ?? []).map((t: { id: string }) => t.id));
        const artistIds = new Set<string>((data.events ?? []).map((e: CalendarEvent) => e.artist_id).filter((id: string | null | undefined): id is string => Boolean(id)));
        setSelectedTourIds(tourIds);
        setSelectedArtistIds(artistIds);
      })
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, []);

  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      if (selectedTourIds.size && !selectedTourIds.has(e.tour_id)) return false;
      if (selectedArtistIds.size && e.artist_id && !selectedArtistIds.has(e.artist_id)) return false;
      return true;
    });
  }, [events, selectedTourIds, selectedArtistIds]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [filteredEvents]);

  const tourColour = useMemo(() => {
    const map = new Map<string, string>();
    const seen = new Set(tours.map((t) => t.id));
    Array.from(seen).forEach((id, i) => map.set(id, COLOURS[i % COLOURS.length]));
    return map;
  }, [tours]);

  const daysInMonth = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const last = new Date(cursor.year, cursor.month + 1, 0);
    const startPad = first.getDay();
    const days: (string | null)[] = [];
    for (let i = 0; i < startPad; i++) days.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      days.push(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
    return days;
  }, [cursor]);

  const toggleTour = (id: string) => {
    setSelectedTourIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : new Set(tours.map((t) => t.id));
    });
  };

  const toggleArtist = (artistId: string) => {
    if (!artistId) return;
    setSelectedArtistIds((prev) => {
      const next = new Set(prev);
      if (next.has(artistId)) next.delete(artistId);
      else next.add(artistId);
      return next.size ? next : new Set(events.map((e) => e.artist_id).filter(Boolean) as string[]);
    });
  };

  const artistIds = useMemo(() => Array.from(new Set(events.map((e) => e.artist_id).filter(Boolean))) as string[], [events]);
  const artistNames = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((e) => { if (e.artist_id) map.set(e.artist_id, e.artist_name); });
    return map;
  }, [events]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-lp-border bg-lp-surface py-16">
        <p className="text-lp-text-tertiary">Loading calendar…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-lp-text-secondary">Tours</span>
        {tours.map((t) => (
          <label key={t.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedTourIds.has(t.id)}
              onChange={() => toggleTour(t.id)}
              className="rounded border-lp-border text-lp-orange focus:ring-lp-orange"
            />
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ background: tourColour.get(t.id) ?? '#6B7280' }}
            />
            <span className="text-sm text-lp-text">{t.name}</span>
          </label>
        ))}
        {tours.length === 0 && <span className="text-sm text-lp-text-tertiary">No tours</span>}
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <span className="text-sm font-medium text-lp-text-secondary">Artists</span>
        {artistIds.map((id) => (
          <label key={id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedArtistIds.has(id)}
              onChange={() => toggleArtist(id)}
              className="rounded border-lp-border text-lp-orange focus:ring-lp-orange"
            />
            <span className="text-sm text-lp-text">{artistNames.get(id) ?? id}</span>
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 }))}
          className="rounded-lg border border-lp-border bg-lp-surface p-2 text-lp-text-tertiary hover:text-lp-text hover:bg-lp-surface-hover"
        >
          <ChevronLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-lp-text">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </h2>
        <button
          type="button"
          onClick={() => setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 }))}
          className="rounded-lg border border-lp-border bg-lp-surface p-2 text-lp-text-tertiary hover:text-lp-text hover:bg-lp-surface-hover"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface overflow-hidden">
        <div className="grid grid-cols-7 border-b border-lp-border bg-lp-bg-tertiary text-xs font-medium text-lp-text-tertiary">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="py-2 text-center">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {daysInMonth.map((dateStr, i) => {
            if (!dateStr) {
              return <div key={`e-${i}`} className="min-h-[80px] border-b border-r border-lp-border bg-lp-bg-secondary/30" />;
            }
            const dayEvents = eventsByDate.get(dateStr) ?? [];
            return (
              <div
                key={dateStr}
                className="min-h-[80px] border-b border-r border-lp-border p-1.5 last:border-r-0"
              >
                <span className="text-xs font-medium text-lp-text-tertiary">{new Date(dateStr + 'T12:00:00').getDate()}</span>
                <div className="mt-1 space-y-1">
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      key={e.routing_id}
                      type="button"
                      onClick={() => setSelectedEvent(e)}
                      className={cn(
                        'w-full text-left rounded px-1.5 py-0.5 text-[11px] truncate block transition-opacity hover:opacity-90'
                      )}
                      style={{ backgroundColor: `${tourColour.get(e.tour_id) ?? '#6B7280'}22`, color: tourColour.get(e.tour_id) ?? '#6B7280' }}
                    >
                      {e.venue_name || e.city || e.tour_name}
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="text-[10px] text-lp-text-tertiary">+{dayEvents.length - 3}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedEvent(null)}>
          <div
            className="w-full max-w-md rounded-xl border border-lp-border bg-lp-surface p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-lp-text">
                  {new Date(selectedEvent.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                <p className="text-sm text-lp-text-secondary">
                  {selectedEvent.venue_name && selectedEvent.city ? `${selectedEvent.venue_name}, ${selectedEvent.city}` : selectedEvent.venue_name || selectedEvent.city || '—'}
                </p>
                <p className="text-xs text-lp-text-tertiary mt-0.5">
                  Tour: {selectedEvent.tour_name}
                  {selectedEvent.artist_name && selectedEvent.artist_name !== '—' ? ` · ${selectedEvent.artist_name}` : ''}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded p-1 text-lp-text-tertiary hover:bg-lp-bg-tertiary">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href={`/tours/${selectedEvent.tour_id}/advance/${selectedEvent.routing_id}`}
                className="flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface-hover px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:bg-lp-orange-subtle"
              >
                <ClipboardList size={16} />
                Advance
              </Link>
              <Link
                href={`/budget?tour_id=${selectedEvent.tour_id}`}
                className="flex items-center gap-2 rounded-lg border border-lp-border bg-lp-surface-hover px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:bg-lp-orange-subtle"
              >
                <Calculator size={16} />
                Budget
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
