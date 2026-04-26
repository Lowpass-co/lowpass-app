import { createClient } from '@/lib/supabase-client';
import type { EntityDescriptor } from './types';

export type GearEntity = {
  id: string;
  workspace_id: string | null;
  name: string;
  type: 'dynamic' | 'condenser' | 'ribbon' | 'di_active' | 'di_passive';
  default_phantom: boolean;
};

const select = 'id, workspace_id, name, type, default_phantom';

async function fetchById(id: string): Promise<GearEntity | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('mic_library')
    .select(select)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return data as GearEntity;
}

async function search(query: string, opts?: { limit?: number; tourId?: string }): Promise<GearEntity[]> {
  const limit = Math.min(opts?.limit ?? 20, 50);
  void opts?.tourId; // mics are workspace-scoped, not per-tour in schema v1
  const supabase = createClient();
  const q = query.trim();
  let builder = supabase.from('mic_library').select(select);
  if (q) {
    builder = builder.ilike('name', `%${q}%`);
  }
  const { data } = await builder.order('name').limit(limit);
  return (data as GearEntity[]) ?? [];
}

export const gearDescriptor: EntityDescriptor<GearEntity> = {
  kind: 'gear',
  fetchById,
  search,
  getLabel: g => g.name,
  getSecondary: g => g.type.replace('_', ' '),
  SlideOverContent: () => import('./slideover/gearBody'),
};
