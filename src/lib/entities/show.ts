import { createClient } from '@/lib/supabase-client';
import type { EntityDescriptor } from './types';

export type ShowEntity = {
  id: string;
  tour_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

const select = 'id, tour_id, date, day_type, city, venue_name';

async function fetchById(id: string): Promise<ShowEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('routing')
    .select(select)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as ShowEntity;
}

async function search(query: string, opts?: { limit?: number; tourId?: string }): Promise<ShowEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const supabase = createClient();
  const q = query.trim();
  let builder = supabase.from('routing').select(select);
  if (opts?.tourId) {
    builder = builder.eq('tour_id', opts.tourId);
  }
  if (q) {
    builder = builder.ilike('venue_name', `%${q}%`);
  }
  const { data } = await builder.order('date', { ascending: true }).limit(limit);
  return (data as ShowEntity[]) ?? [];
}

export const showDescriptor: EntityDescriptor<ShowEntity> = {
  kind: 'show',
  fetchById,
  search,
  getLabel: s => s.venue_name || s.city || s.date,
  getSecondary: s => `${s.date} · ${s.day_type}`,
  SlideOverContent: () => import('./slideover/showBody'),
};
