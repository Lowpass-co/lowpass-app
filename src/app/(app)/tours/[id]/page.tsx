/* ============================================
   LOWPASS — Tour Overview (UX16)

   Today-anchored timeline of Shows / Hotels / Flights for a single tour.
   The legacy header strip + advance-summary surface is retired in favour of
   <TimelineDashboard>; quick links live in the LeftRail (dashboard archetype).
   ============================================ */

import { notFound } from 'next/navigation';
import { dashboardAppPageShell } from '@/components/shell/app-page-shells';
import { getDashboardLeftRail } from '@/lib/shell/rails/dashboardForTour';
import { createServerSupabaseClient } from '@/lib/supabase-server';
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

export default async function TourDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ toast?: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name, status, start_date, end_date, currency, artist:artists(name)')
    .eq('id', id)
    .single();

  if (tourErr || !tour) {
    notFound();
  }

  const tourId = tour.id as string;
  const artist = Array.isArray(tour.artist) ? tour.artist[0] : tour.artist;

  // Shows — from routing rows. day_type 'show'/'festival' carry the show colour;
  // other day types still appear so the user sees travel/off context.
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, city, venue_name, day_type')
    .eq('tour_id', tourId)
    .order('date', { ascending: true });

  const shows: ShowVm[] = (routingRows ?? [])
    .filter((r) => isoDateOnly(r.date as string | null))
    .map((r) => ({
      type: 'show',
      routingId: r.id as string,
      date: isoDateOnly(r.date as string | null) as string,
      city: (r.city as string | null) ?? '',
      venueName: (r.venue_name as string | null) ?? null,
      dayType: (r.day_type as string | null) ?? null,
    }));

  // Hotels — UX11 canonical entity. Pre-fetch one room per hotel so card
  // click can open the first room's slide-over without a second roundtrip.
  const { data: hotelRows } = await supabase
    .from('hotels')
    .select('id, name, check_in_at, check_out_at')
    .eq('tour_id', tourId)
    .order('check_in_at', { ascending: true });

  const hotelIds = (hotelRows ?? []).map((h) => h.id as string);
  const { data: roomRows } = hotelIds.length
    ? await supabase.from('rooms').select('id, hotel_id').in('hotel_id', hotelIds)
    : { data: [] as { id: string; hotel_id: string }[] };

  const roomsByHotel = new Map<string, string[]>();
  for (const r of (roomRows ?? []) as { id: string; hotel_id: string }[]) {
    const list = roomsByHotel.get(r.hotel_id) ?? [];
    list.push(r.id);
    roomsByHotel.set(r.hotel_id, list);
  }

  const hotels: HotelVm[] = (hotelRows ?? [])
    .filter((h) => isoDateOnly(h.check_in_at as string | null) && isoDateOnly(h.check_out_at as string | null))
    .map((h) => {
      const id = h.id as string;
      const rooms = roomsByHotel.get(id) ?? [];
      return {
        type: 'hotel',
        hotelId: id,
        firstRoomId: rooms[0] ?? null,
        name: (h.name as string | null) ?? '—',
        checkInDate: isoDateOnly(h.check_in_at as string | null) as string,
        checkOutDate: isoDateOnly(h.check_out_at as string | null) as string,
        roomCount: rooms.length,
      };
    });

  // Flights — UX09 canonical entity. Single-day card at depart_at; multi-leg
  // splits are deferred per UX16 §3.3.
  const { data: flightRows } = await supabase
    .from('flights')
    .select('id, airline, flight_number, origin_airport, destination_airport, depart_at')
    .eq('tour_id', tourId)
    .order('depart_at', { ascending: true });

  const flights: FlightVm[] = (flightRows ?? [])
    .filter((f) => isoDateOnly(f.depart_at as string | null))
    .map((f) => ({
      type: 'flight',
      flightId: f.id as string,
      date: isoDateOnly(f.depart_at as string | null) as string,
      airline: (f.airline as string | null) ?? null,
      flightNumber: (f.flight_number as string | null) ?? null,
      origin: (f.origin_airport as string | null) ?? '—',
      destination: (f.destination_airport as string | null) ?? '—',
    }));

  // Header stats — shows / personnel / total budget (proposed sum).
  const showCount = shows.filter((s) => {
    const dt = s.dayType?.toLowerCase() ?? '';
    return dt.includes('show') || dt.includes('festival');
  }).length;

  const { count: personnelCount } = await supabase
    .from('tour_personnel')
    .select('*', { count: 'exact', head: true })
    .eq('tour_id', tourId);

  const { data: budgetRows } = await supabase
    .from('budget_line_items')
    .select('proposed_cost')
    .eq('tour_id', tourId);

  const totalBudget = (budgetRows ?? []).reduce((sum, r) => {
    const n = Number((r as { proposed_cost?: number | null }).proposed_cost ?? 0);
    return sum + (Number.isFinite(n) ? n : 0);
  }, 0);

  return dashboardAppPageShell(
    <TourOverviewClient
      tourId={tourId}
      tourName={(tour.name as string | null) ?? 'Tour'}
      artistName={(artist?.name as string | null) ?? '—'}
      status={(tour.status as string | null) ?? 'planning'}
      startDate={isoDateOnly(tour.start_date as string | null)}
      endDate={isoDateOnly(tour.end_date as string | null)}
      currency={(tour.currency as string | null) ?? null}
      showCount={showCount}
      personnelCount={personnelCount ?? 0}
      totalBudget={totalBudget || null}
      shows={shows}
      hotels={hotels}
      flights={flights}
    />,
    getDashboardLeftRail(tourId),
  );
}
