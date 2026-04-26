import { createClient } from '@/lib/supabase-client';
import type { EntityDescriptor } from './types';

export type PersonEntity = {
  id: string;
  name: string;
  lp_id: string;
  email: string | null;
  role: string;
};

const select = 'id, name, lp_id, email, role';

async function fetchById(id: string): Promise<PersonEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('personnel')
    .select(select)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as PersonEntity;
}

async function search(query: string, opts?: { limit?: number; tourId?: string }): Promise<PersonEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  const supabase = createClient();
  const q = query.trim();
  if (!q) {
    const { data } = await supabase.from('personnel').select(select).order('name').limit(limit);
    return (data as PersonEntity[]) ?? [];
  }
  const { data } = await supabase
    .from('personnel')
    .select(select)
    .ilike('name', `%${q}%`)
    .order('name')
    .limit(limit);
  return (data as PersonEntity[]) ?? [];
}

export const personDescriptor: EntityDescriptor<PersonEntity> = {
  kind: 'person',
  fetchById,
  search,
  getLabel: p => p.name,
  getSecondary: p => p.lp_id,
  SlideOverContent: () => import('./slideover/personBody'),
};
