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
  /**
   * UX21 — when called from a tour-context (Channel List, Stage Plot), the
   * picker surfaces unlinked rental_inventory items alongside Gear results.
   * The opt-in flag is forwarded; server-side fan-out is via the separate
   * /api/gear/rental-inventory endpoint that callers query in parallel.
   */
  search: (query: string, opts?: { tourId?: string; limit?: number }) =>
    searchGear(query, {
      tourId: opts?.tourId,
      limit: opts?.limit,
      includeRentalInventory: !!opts?.tourId,
    }),
  getLabel: (g) => `${g.manufacturer ?? ''} ${g.model ?? g.name}`.trim(),
  getSecondary: (g) => {
    const base = `${g.category ?? 'gear'} · ${String(g.ownership).replace('_', '-')}`;
    // UX21 — flag the rental-house source so the picker / chip indicates origin.
    return g.rentalInventoryId ? `${base} · Rental inventory` : base;
  },
  // Registry doesn't yet style labels, but keep for future UI parity with prompt.
  getColor: (g: { ownership: string }) => OWNERSHIP_COLORS[g.ownership] ?? 'text-lp-text-secondary',
  SlideOverContent: () => import('@/components/entity/gear/GearSlideOver'),
});
