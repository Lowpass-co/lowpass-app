import { createClient } from '@/lib/supabase-client';
import { registerEntity } from './registry';

export type ShowEntity = {
  id: string;
  tour_id: string;
  date: string;
  day_type: string;
  city: string;
  venue_name: string | null;
};

const SELECT = 'id, tour_id, date, day_type, city, venue_name';

async function fetchById(id: string): Promise<ShowEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('routing')
    .select(SELECT)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as ShowEntity;
}

async function searchShows(
  query: string,
  opts?: { limit?: number; tourId?: string }
): Promise<ShowEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const supabase = createClient();
  const q = query.trim();

  let builder = supabase.from('routing').select(SELECT);
  if (opts?.tourId) builder = builder.eq('tour_id', opts.tourId);
  if (q) builder = builder.or(`venue_name.ilike.%${q}%,city.ilike.%${q}%`);

  const { data, error } = await builder.order('date', { ascending: true }).limit(limit);
  if (error || !data) return [];
  return data as ShowEntity[];
}

registerEntity<ShowEntity>({
  kind: 'show',
  fetchById,
  search: searchShows,
  getLabel: (s) => s.venue_name || s.city || s.date,
  getSecondary: (s) => `${s.date} · ${s.day_type}`,
  SlideOverContent: () => import('@/components/entity/show/ShowSlideOver'),
});
