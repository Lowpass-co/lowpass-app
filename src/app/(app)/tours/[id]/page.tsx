/* ============================================
   LOWPASS — Tour Hub
   Built on the budget-redesign fix-up branch (X3) — PR #3 originally
   specified this redesign in nav-redesign Phase C, but Adam's smoke
   test of PR #6 surfaced that PR #3's claim of shipping it was wrong.
   None of the components existed; the route still rendered the legacy
   left-rail tabs. This commit ships Phase C as originally specified.

   Layout, top to bottom:
     Top strip       ← Artist link  |  Switch tour ▾
     Hero            tour name + status pill + "date range · artist"
     Setup strip     Routing / Channel list / Personnel / Rooming /
                     Riders linked  (chips, each clickable)
     Primary CTAs    Advance card | Budget card  (2px brand-orange
                     borders, 4% orange tint background, progress
                     bars, "Open … →" CTA)
     Timeline        TourOverviewClient (UX16) wrapped in a
                     bg-secondary card — secondary visual weight
     Secondary       Personnel · Routing · Channel list · Rooming
                     (small TourSecondaryCard row)

   topBarOnlyAppPageShell deliberately drops the left-rail of tabs
   that the previous dashboardAppPageShell + getDashboardLeftRail
   put on this surface. Tour-internal pages (advance, budget,
   routing…) keep their docSections rails — only the hub itself
   drops the rail per CC_BUDGET_REDESIGN_FIXUP.md X3.2.
   ============================================ */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { topBarOnlyAppPageShell } from '@/components/shell/app-page-shells';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getTourHubData } from '@/server/tours/getTourHubData';
import { SetupStatusStrip } from '@/components/tours/SetupStatusStrip';
import { TourPrimaryCTACard } from '@/components/tours/TourPrimaryCTACard';
import { TourSecondaryCard } from '@/components/tours/TourSecondaryCard';
import { TourSwitchDropdown } from '@/components/tours/TourSwitchDropdown';
import {
  TourOverviewClient,
  type FlightVm,
  type HotelVm,
  type ShowVm,
} from '@/components/tours/TourOverviewClient';

function isoDateOnly(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length >= 10 ? value.slice(0, 10) : null;
}

function statusTokens(status: string): { color: string; label: string } {
  switch (status) {
    case 'active':
      return { color: 'var(--color-lp-status-complete)', label: 'Active' };
    case 'planning':
      return { color: 'var(--color-lp-status-needs-review)', label: 'Planning' };
    case 'completed':
      return { color: 'var(--color-lp-status-not-started)', label: 'Completed' };
    case 'archived':
      return { color: 'var(--color-lp-status-not-started)', label: 'Archived' };
    default:
      return { color: 'var(--color-lp-status-not-started)', label: status };
  }
}

function formatTourDateRange(start: string, end: string): string {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return '';
  if (s.getFullYear() === e.getFullYear()) {
    const sm = s.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const em = e.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    return `${sm} – ${em}`;
  }
  const a = s.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  const b = e.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  return `${a} – ${b}`;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: '£',
  USD: '$',
  EUR: '€',
  AUD: 'A$',
  CAD: 'C$',
};

function formatCompactCurrency(value: number, currency: string): string {
  const sym = CURRENCY_SYMBOL[currency.toUpperCase()] ?? `${currency} `;
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sym}${Math.round(value / 1_000)}K`;
  return `${sym}${Math.round(value)}`;
}

function budgetBarColor(percent: number): string {
  if (percent > 100) return 'var(--color-lp-error, #EF4444)';
  if (percent > 80) return 'var(--color-lp-warning, #F59E0B)';
  return 'var(--color-lp-status-complete)';
}

export default async function TourHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const hub = await getTourHubData(supabase, tourId);
  if (!hub) notFound();

  // Timeline data (shows / hotels / flights) for the secondary
  // TourOverviewClient. Same shape as the previous TourDetailPage
  // implementation; kept inline so this page owns its render.
  const [routingRes, hotelRes, flightRes, personnelCountRes] =
    await Promise.all([
      supabase
        .from('routing')
        .select('id, date, city, venue_name, day_type')
        .eq('tour_id', tourId)
        .order('date', { ascending: true }),
      supabase
        .from('hotels')
        .select('id, name, check_in_at, check_out_at')
        .eq('tour_id', tourId)
        .order('check_in_at', { ascending: true }),
      supabase
        .from('flights')
        .select('id, airline, flight_number, origin_airport, destination_airport, depart_at')
        .eq('tour_id', tourId)
        .order('depart_at', { ascending: true }),
      supabase
        .from('tour_personnel')
        .select('id', { count: 'exact', head: true })
        .eq('tour_id', tourId),
    ]);

  const shows: ShowVm[] = (routingRes.data ?? [])
    .filter((r) => isoDateOnly(r.date as string | null))
    .map((r) => ({
      type: 'show' as const,
      routingId: r.id as string,
      date: isoDateOnly(r.date as string | null) as string,
      city: (r.city as string | null) ?? '',
      venueName: (r.venue_name as string | null) ?? null,
      dayType: (r.day_type as string | null) ?? null,
    }));

  const hotelIds = (hotelRes.data ?? []).map((h) => (h as { id: string }).id);
  const { data: roomRows } = hotelIds.length
    ? await supabase.from('rooms').select('id, hotel_id').in('hotel_id', hotelIds)
    : { data: [] as { id: string; hotel_id: string }[] };
  const roomsByHotel = new Map<string, string[]>();
  for (const r of (roomRows ?? []) as { id: string; hotel_id: string }[]) {
    const list = roomsByHotel.get(r.hotel_id) ?? [];
    list.push(r.id);
    roomsByHotel.set(r.hotel_id, list);
  }
  const hotels: HotelVm[] = (hotelRes.data ?? [])
    .filter(
      (h) =>
        isoDateOnly(h.check_in_at as string | null) &&
        isoDateOnly(h.check_out_at as string | null),
    )
    .map((h) => {
      const id = h.id as string;
      const rooms = roomsByHotel.get(id) ?? [];
      return {
        type: 'hotel' as const,
        hotelId: id,
        firstRoomId: rooms[0] ?? null,
        name: (h.name as string | null) ?? '—',
        checkInDate: isoDateOnly(h.check_in_at as string | null) as string,
        checkOutDate: isoDateOnly(h.check_out_at as string | null) as string,
        roomCount: rooms.length,
      };
    });

  const flights: FlightVm[] = (flightRes.data ?? [])
    .filter((f) => isoDateOnly(f.depart_at as string | null))
    .map((f) => ({
      type: 'flight' as const,
      flightId: f.id as string,
      date: isoDateOnly(f.depart_at as string | null) as string,
      airline: (f.airline as string | null) ?? null,
      flightNumber: (f.flight_number as string | null) ?? null,
      origin: (f.origin_airport as string | null) ?? '—',
      destination: (f.destination_airport as string | null) ?? '—',
    }));

  const totalShowsForOverview = shows.filter((s) => {
    const dt = s.dayType?.toLowerCase() ?? '';
    return dt.includes('show') || dt.includes('festival');
  }).length;

  const status = statusTokens(hub.tour.status);
  const dateRange = formatTourDateRange(hub.tour.start_date, hub.tour.end_date);
  const advancePercentRounded = Math.round(hub.advance.percent);
  const budgetPercentRounded = Math.round(hub.budget.percent);
  const budgetProposedFmt = formatCompactCurrency(hub.budget.proposed, hub.budget.currency);
  const budgetActualFmt = formatCompactCurrency(hub.budget.actual, hub.budget.currency);

  return topBarOnlyAppPageShell(
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 pb-24 pt-6">
      {/* Top strip — ← Artist link + Switch tour ▾ */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/artists/${hub.artist.id}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" />
          {hub.artist.name}
        </Link>
        <TourSwitchDropdown
          currentTourId={hub.tour.id}
          currentTourName={hub.tour.name}
          siblings={hub.siblingTours}
        />
      </div>

      {/* Hero */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            style={{
              color: 'var(--lp-text)',
              fontSize: 'var(--lp-text-3xl)',
              fontWeight: 'var(--lp-weight-medium)',
              lineHeight: 'var(--lp-leading-tight)',
            }}
          >
            {hub.tour.name}
          </h1>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1"
            style={{
              background: `color-mix(in srgb, ${status.color} 15%, transparent)`,
              color: status.color,
              fontSize: 'var(--lp-text-xs)',
              fontWeight: 'var(--lp-weight-medium)',
            }}
          >
            <span
              aria-hidden
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: status.color }}
            />
            {status.label}
          </span>
        </div>
        <div
          className="inline-flex items-center gap-1.5 text-sm"
          style={{ color: 'var(--lp-text-secondary)' }}
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          {dateRange ? <span>{dateRange}</span> : null}
          {dateRange ? <span aria-hidden>·</span> : null}
          <span>{hub.artist.name}</span>
        </div>
      </div>

      {/* Setup strip */}
      <SetupStatusStrip tourId={hub.tour.id} setup={hub.setup} />

      {/* Two big CTAs */}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}
      >
        <TourPrimaryCTACard
          label="Advance"
          primaryMetric={`${hub.advance.completeShows} / ${hub.advance.totalShows}`}
          subLabel={
            hub.advance.totalShows === 0
              ? 'No shows yet'
              : `shows complete · ${advancePercentRounded}%`
          }
          progressPercent={hub.advance.percent}
          ctaText="Open advance"
          href={`/advance/${hub.tour.id}`}
        />
        <TourPrimaryCTACard
          label="Budget"
          primaryMetric={`${budgetActualFmt} / ${budgetProposedFmt}`}
          subLabel={
            hub.budget.proposed === 0
              ? 'No estimate yet'
              : `spent · ${budgetPercentRounded}% of estimate`
          }
          progressPercent={hub.budget.percent}
          progressColor={budgetBarColor(hub.budget.percent)}
          barWidthPercent={Math.min(100, hub.budget.percent)}
          ctaText="Open budget"
          href={`/budget/${hub.tour.id}`}
        />
      </div>

      {/* Timeline (UX16) — secondary */}
      <section className="space-y-2">
        <h2
          style={{
            color: 'var(--lp-text-tertiary)',
            fontSize: 'var(--lp-text-xs)',
            fontWeight: 'var(--lp-weight-semibold)',
            letterSpacing: 'var(--lp-tracking-caps)',
            textTransform: 'uppercase',
          }}
        >
          Timeline
        </h2>
        <div
          className="rounded-xl border p-4"
          style={{
            borderColor: 'var(--lp-border)',
            background: 'var(--lp-bg-secondary)',
          }}
        >
          <TourOverviewClient
            tourId={hub.tour.id}
            tourName={hub.tour.name}
            artistName={hub.artist.name}
            status={hub.tour.status}
            startDate={isoDateOnly(hub.tour.start_date)}
            endDate={isoDateOnly(hub.tour.end_date)}
            currency={hub.tour.currency}
            showCount={totalShowsForOverview}
            personnelCount={personnelCountRes.count ?? 0}
            totalBudget={hub.budget.proposed || null}
            shows={shows}
            hotels={hotels}
            flights={flights}
          />
        </div>
      </section>

      {/* Secondary cards */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        <TourSecondaryCard
          title="Personnel"
          subLine={
            hub.secondary.personnelCount === 1
              ? '1 assigned'
              : `${hub.secondary.personnelCount} assigned`
          }
          href={`/tours/${hub.tour.id}/personnel`}
        />
        <TourSecondaryCard
          title="Routing"
          subLine={
            hub.secondary.routingCount === 1
              ? '1 date'
              : `${hub.secondary.routingCount} dates`
          }
          href={`/tours/${hub.tour.id}/routing`}
        />
        <TourSecondaryCard
          title="Channel list"
          subLine={hub.secondary.channelListConfigured ? 'Configured' : 'Not set'}
          href={`/tours/${hub.tour.id}/channel-list`}
        />
        <TourSecondaryCard
          title="Rooming"
          subLine={
            hub.secondary.roomCount === 0
              ? 'Not set'
              : hub.secondary.roomCount === 1
                ? '1 room'
                : `${hub.secondary.roomCount} rooms`
          }
          href={`/tours/${hub.tour.id}/rooming`}
        />
      </div>
    </div>,
  );
}
