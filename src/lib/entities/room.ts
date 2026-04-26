import { createClient } from '@/lib/supabase-client';
import type { EntityDescriptor } from './types';

export type RoomEntity = {
  id: string;
  tour_id: string;
  hotel_name: string;
  city: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
};

const select = 'id, tour_id, hotel_name, city, check_in_date, check_out_date';

async function fetchById(id: string): Promise<RoomEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('hotel_bookings')
    .select(select)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as RoomEntity;
}

async function search(query: string, opts?: { limit?: number; tourId?: string }): Promise<RoomEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const supabase = createClient();
  const q = query.trim();
  let builder = supabase.from('hotel_bookings').select(select);
  if (opts?.tourId) {
    builder = builder.eq('tour_id', opts.tourId);
  }
  if (q) {
    builder = builder.ilike('hotel_name', `%${q}%`);
  }
  const { data } = await builder.order('check_in_date', { ascending: true }).limit(limit);
  return (data as RoomEntity[]) ?? [];
}

export const roomDescriptor: EntityDescriptor<RoomEntity> = {
  kind: 'room',
  fetchById,
  search,
  getLabel: r => r.hotel_name,
  getSecondary: r => (r.city?.trim() ? r.city : (r.check_in_date ?? '—')),
  SlideOverContent: () => import('./slideover/roomBody'),
};
