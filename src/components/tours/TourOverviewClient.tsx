'use client';

/* ============================================
   LOWPASS — Tour Overview (UX16)

   Today-anchored timeline with Shows / Hotels / Flights rows on top of the
   foundation <TimelineDashboard> primitive (UX07). Card click opens the
   matching entity slide-over via useEntityRouting().

   Tasks row is intentionally deferred — there is no canonical reminders
   entity yet. See UX16 prompt §3.3 / out-of-scope §8.
   ============================================ */

import Link from 'next/link';
import { useMemo } from 'react';
import { Plane, Building2, Music, Plus, Search, FileUp, Users } from 'lucide-react';
import { TimelineDashboard } from '@/components/timeline/TimelineDashboard';
import type { TimelineRow, TimelineItem } from '@/components/timeline/types';
import { useEntityRouting } from '@/components/entity/EntityRoutingContext';
import { useToast } from '@/components/ui/Toast';
import { cn } from '@/lib/utils';
import { colourForDayType } from '@/lib/routing/dayType';

export type ShowVm = {
  type: 'show';
  routingId: string;
  date: string; // YYYY-MM-DD
  city: string;
  venueName: string | null;
  dayType: string | null;
};

export type HotelVm = {
  type: 'hotel';
  hotelId: string;
  firstRoomId: string | null;
  name: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD (exclusive — last night = checkOut - 1)
  roomCount: number;
};

export type FlightVm = {
  type: 'flight';
  flightId: string;
  date: string; // YYYY-MM-DD (depart_at date in viewer locale)
  airline: string | null;
  flightNumber: string | null;
  origin: string;
  destination: string;
};

type ItemData = ShowVm | HotelVm | FlightVm;

export type TourOverviewClientProps = {
  tourId: string;
  tourName: string;
  artistName: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  currency: string | null;
  showCount: number;
  personnelCount: number;
  totalBudget: number | null;
  shows: ShowVm[];
  hotels: HotelVm[];
  flights: FlightVm[];
};

/** Inclusive end-date for hotel spans: hotel cards span check-in → checkout-1. */
function spanEndYmd(checkOutYmd: string): string {
  const d = new Date(`${checkOutYmd}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Pad the timeline window 14 days either side of the tour so today is in
 * range during pre-tour planning, and the user can scroll a little past the
 * end during the wrap-up phase.
 */
function buildWindow(
  startDate: string | null,
  endDate: string | null,
  shows: ShowVm[],
  hotels: HotelVm[],
  flights: FlightVm[],
): { startYmd: string; endYmd: string } {
  const candidates: string[] = [];
  if (startDate) candidates.push(startDate);
  if (endDate) candidates.push(endDate);
  for (const s of shows) candidates.push(s.date);
  for (const h of hotels) {
    candidates.push(h.checkInDate);
    candidates.push(h.checkOutDate);
  }
  for (const f of flights) candidates.push(f.date);
  // Always include today so the timeline anchors correctly even pre/post-tour.
  candidates.push(new Date().toISOString().slice(0, 10));

  candidates.sort();
  const earliest = candidates[0];
  const latest = candidates[candidates.length - 1];

  const pad = (ymd: string, deltaDays: number): string => {
    const d = new Date(`${ymd}T12:00:00`);
    d.setDate(d.getDate() + deltaDays);
    return d.toISOString().slice(0, 10);
  };

  return { startYmd: pad(earliest, -14), endYmd: pad(latest, 14) };
}

export function TourOverviewClient({
  tourId,
  tourName,
  artistName,
  status,
  startDate,
  endDate,
  currency,
  showCount,
  personnelCount,
  totalBudget,
  shows,
  hotels,
  flights,
}: TourOverviewClientProps) {
  const routing = useEntityRouting();
  const { showToast } = useToast();

  const window = useMemo(
    () => buildWindow(startDate, endDate, shows, hotels, flights),
    [startDate, endDate, shows, hotels, flights],
  );

  const rows = useMemo<TimelineRow<ItemData>[]>(() => {
    const showItems: TimelineItem<ItemData>[] = shows.map((s) => ({
      id: `show-${s.routingId}`,
      startDate: s.date,
      endDate: s.date,
      data: s,
      color: colourForDayType(s.dayType),
      onClick: () => routing.open({ kind: 'show', id: s.routingId }),
      render: (data) => {
        const v = data as ShowVm;
        return (
          <div className="flex h-full flex-col justify-center gap-0.5 px-1.5">
            <span className="truncate text-[12px] font-semibold text-lp-text">{v.city || '—'}</span>
            {v.venueName ? (
              <span className="truncate text-[10px] text-lp-text-secondary">{v.venueName}</span>
            ) : null}
          </div>
        );
      },
    }));

    const hotelItems: TimelineItem<ItemData>[] = hotels.map((h) => ({
      id: `hotel-${h.hotelId}`,
      startDate: h.checkInDate,
      endDate: spanEndYmd(h.checkOutDate),
      data: h,
      color: 'var(--color-lp-day-hotel, #0EA5E9)',
      onClick: () => {
        if (h.firstRoomId) {
          routing.open({ kind: 'room', id: h.firstRoomId });
        } else {
          showToast('No rooms on this hotel yet', 'error');
        }
      },
      render: (data) => {
        const v = data as HotelVm;
        return (
          <div className="flex h-full items-center gap-1.5 px-1.5">
            <Building2 size={12} className="shrink-0 opacity-70" aria-hidden />
            <span className="truncate text-[11px] font-medium text-lp-text">{v.name}</span>
            {v.roomCount > 0 ? (
              <span className="ml-auto shrink-0 rounded-full bg-lp-bg-tertiary px-1.5 text-[10px] tabular-nums text-lp-text-secondary">
                {v.roomCount}
              </span>
            ) : null}
          </div>
        );
      },
    }));

    const flightItems: TimelineItem<ItemData>[] = flights.map((f) => ({
      id: `flight-${f.flightId}`,
      startDate: f.date,
      endDate: f.date,
      data: f,
      color: 'var(--color-lp-day-travel, #2563EB)',
      onClick: () => routing.open({ kind: 'flight', id: f.flightId }),
      render: (data) => {
        const v = data as FlightVm;
        const label = v.flightNumber
          ? `${v.airline ?? ''} ${v.flightNumber}`.trim()
          : v.airline ?? 'Flight';
        return (
          <div className="flex h-full flex-col justify-center gap-0.5 px-1.5">
            <span className="truncate text-[11px] font-semibold text-lp-text">{label}</span>
            <span className="truncate text-[10px] text-lp-text-secondary">
              {v.origin} → {v.destination}
            </span>
          </div>
        );
      },
    }));

    return [
      { id: 'shows', label: 'Shows', icon: Music, items: showItems },
      { id: 'hotels', label: 'Hotels', icon: Building2, items: hotelItems },
      { id: 'flights', label: 'Flights', icon: Plane, items: flightItems },
    ];
  }, [shows, hotels, flights, routing, showToast]);

  const formattedBudget = useMemo(() => {
    if (totalBudget == null || !Number.isFinite(totalBudget)) return null;
    try {
      return totalBudget.toLocaleString('en-GB', {
        style: 'currency',
        currency: currency ?? 'GBP',
        maximumFractionDigits: 0,
      });
    } catch {
      return totalBudget.toFixed(0);
    }
  }, [totalBudget, currency]);

  const daysRemaining = useMemo(() => {
    if (!endDate) return null;
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T12:00:00');
    const end = new Date(`${endDate}T12:00:00`);
    if (today.getTime() > end.getTime()) return null;
    return Math.ceil((end.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  }, [endDate]);

  const dateRangeLabel = useMemo(() => {
    if (!startDate || !endDate) return '—';
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    return `${new Date(`${startDate}T12:00:00`).toLocaleDateString('en-GB', opts)} – ${new Date(`${endDate}T12:00:00`).toLocaleDateString('en-GB', opts)}`;
  }, [startDate, endDate]);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 pb-12 pt-6">
      {/* Header strip */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-lp-text">{tourName}</h1>
            <span
              className={cn(
                'rounded-full border border-lp-border px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
                status === 'active' && 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
                status === 'archived' && 'text-lp-text-tertiary',
                status === 'planning' && 'border-blue-500/40 text-blue-600 dark:text-blue-400',
              )}
            >
              {status}
            </span>
          </div>
          <p className="mt-1 text-sm text-lp-text-secondary">
            {artistName} · {dateRangeLabel}
            {daysRemaining != null ? ` · ${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining` : ''}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lp-bg-tertiary px-3 py-1 text-[12px] tabular-nums text-lp-text-secondary">
              <Music size={12} aria-hidden />
              {showCount} show{showCount === 1 ? '' : 's'}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-lp-bg-tertiary px-3 py-1 text-[12px] tabular-nums text-lp-text-secondary">
              <Users size={12} aria-hidden />
              {personnelCount} personnel
            </span>
            {formattedBudget ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-lp-bg-tertiary px-3 py-1 text-[12px] tabular-nums text-lp-text-secondary">
                <Building2 size={12} aria-hidden />
                {formattedBudget}
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href={`/tours/${tourId}/routing`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors"
          >
            <Plus size={14} /> Add show
          </Link>
          <Link
            href={`/tours/${tourId}/personnel`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors"
          >
            <Plus size={14} /> Add personnel
          </Link>
          <Link
            href={`/tours/${tourId}/files`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors"
          >
            <FileUp size={14} /> Add file
          </Link>
          <button
            type="button"
            onClick={() =>
              showToast('Command palette (UX08b) is not yet built — coming in a follow-up phase.', 'error')
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:border-lp-orange hover:text-lp-orange transition-colors"
          >
            <Search size={14} /> ⌘K
          </button>
        </div>
      </header>

      {/* Timeline */}
      <TimelineDashboard<ItemData>
        rows={rows}
        startDate={window.startYmd}
        endDate={window.endYmd}
      />
    </div>
  );
}
