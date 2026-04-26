import { createClient } from '@/lib/supabase-client';
import type { EntityDescriptor } from './types';

export type FlightEntity = {
  id: string;
  tour_id: string;
  person_name: string;
  role: string | null;
  origin_code: string | null;
  destination_code: string | null;
  flight_number: string | null;
  airline: string | null;
  departure_date: string | null;
};

const select =
  'id, tour_id, person_name, role, origin_code, destination_code, flight_number, airline, departure_date';

async function fetchById(id: string): Promise<FlightEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('flight_bookings')
    .select(select)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as FlightEntity;
}

async function search(query: string, opts?: { limit?: number; tourId?: string }): Promise<FlightEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const supabase = createClient();
  const q = query.trim();
  let builder = supabase.from('flight_bookings').select(select);
  if (opts?.tourId) {
    builder = builder.eq('tour_id', opts.tourId);
  }
  if (q) {
    builder = builder.ilike('person_name', `%${q}%`);
  }
  const { data } = await builder.order('departure_date', { ascending: false }).limit(limit);
  return (data as FlightEntity[]) ?? [];
}

export const flightDescriptor: EntityDescriptor<FlightEntity> = {
  kind: 'flight',
  fetchById,
  search,
  getLabel: f =>
    f.flight_number
      ? [f.flight_number, f.origin_code, f.destination_code].filter(Boolean).join(' ')
      : f.person_name,
  getSecondary: f => f.person_name,
  SlideOverContent: () => import('./slideover/flightBody'),
};
