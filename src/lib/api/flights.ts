import type { Flight } from '@/lib/types/flight';

type FlightRow = {
  id: string;
  workspace_id: string;
  tour_id: string;
  airline: string | null;
  flight_number: string | null;
  pnr: string | null;
  origin_airport: string;
  destination_airport: string;
  depart_at: string;
  arrive_at: string;
  cost_amount: number | null;
  cost_currency: string | null;
  passenger_ids: string[] | null;
  notes: string | null;
  show_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapFlight(row: FlightRow): Flight {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    tourId: row.tour_id,
    airline: row.airline,
    flightNumber: row.flight_number,
    pnr: row.pnr,
    originAirport: row.origin_airport,
    destinationAirport: row.destination_airport,
    departAt: row.depart_at,
    arriveAt: row.arrive_at,
    costAmount: row.cost_amount,
    costCurrency: row.cost_currency ?? 'GBP',
    passengerIds: row.passenger_ids ?? [],
    notes: row.notes,
    showId: row.show_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listFlights(tourId: string): Promise<Flight[]> {
  const res = await fetch(`/api/flights?tour_id=${encodeURIComponent(tourId)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to load flights');
  const json = (await res.json()) as { flights?: FlightRow[] };
  return (json.flights ?? []).map(mapFlight);
}

export async function getFlightById(id: string): Promise<Flight | null> {
  const res = await fetch(`/api/flights/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const json = (await res.json()) as FlightRow;
  return mapFlight(json);
}

export async function searchFlights(
  query: string,
  opts?: { tourId?: string; limit?: number }
): Promise<Flight[]> {
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (opts?.tourId) params.set('tour_id', opts.tourId);
  if (opts?.limit) params.set('limit', String(opts.limit));
  const res = await fetch(`/api/flights?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to search flights');
  const json = (await res.json()) as { flights?: FlightRow[] };
  return (json.flights ?? []).map(mapFlight);
}

export async function createFlight(input: Record<string, unknown>): Promise<Flight> {
  const res = await fetch('/api/flights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create flight');
  return mapFlight((await res.json()) as FlightRow);
}

export async function updateFlight(id: string, patch: Record<string, unknown>): Promise<Flight> {
  const res = await fetch(`/api/flights/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error('Failed to update flight');
  return mapFlight((await res.json()) as FlightRow);
}

export async function deleteFlight(id: string): Promise<void> {
  const res = await fetch(`/api/flights/${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete flight');
}
