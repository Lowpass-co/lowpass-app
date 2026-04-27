import { getGearById, searchGear } from '@/lib/api/gear';
import { registerEntity } from './registry';

const OWNERSHIP_COLORS: Record<string, string> = {
  owned: 'text-emerald-500',
  sub_hired: 'text-sky-500',
  hired_to_client: 'text-lp-orange',
};

registerEntity({
  kind: 'gear',
  fetchById: getGearById,
  search: (query: string, opts?: { tourId?: string; limit?: number }) =>
    searchGear(query, { tourId: opts?.tourId, limit: opts?.limit }),
  getLabel: (g) => `${g.manufacturer ?? ''} ${g.model ?? g.name}`.trim(),
  getSecondary: (g) => `${g.category ?? 'gear'} · ${String(g.ownership).replace('_', '-')}`,
  // Registry doesn't yet style labels, but keep for future UI parity with prompt.
  getColor: (g: { ownership: string }) => OWNERSHIP_COLORS[g.ownership] ?? 'text-lp-text-secondary',
  SlideOverContent: () => import('@/components/entity/gear/GearSlideOver'),
});
