/* ============================================================
   LOWPASS — Intake prefill · server context loader (P7 · Checkpoint B)

   Server-only. Resolves the two prefill sources for an intake link:
     (a) canonical venue via resolveVenue (venue SSOT), and
     (b) the most-recent past advance at the SAME venue (matched by
         canonical_venue_id, else venue_name), any tour, THIS workspace, with
         non-empty data.
   Returns the shapes buildPrefillProposals (pure) consumes. No proposal logic
   here — this only fetches.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import type { AdvanceData } from './intake';
import type { CanonicalHints, PriorAdvanceSource } from './intake-prefill';

function monthLabel(date: string | null): string {
  if (!date) return 'previous';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return 'previous';
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export async function loadPrefillContext(
  service: SupabaseClient,
  opts: { workspaceId: string; routingId: string },
): Promise<{ canonical: CanonicalHints | null; prior: PriorAdvanceSource | null }> {
  const venueCols =
    'id, date, city, country, address, venue_name, venue_capacity, venue_frozen_at, canonical_venue_id, canonical:canonical_venues(id, name, address, city, country, capacity)';

  const { data: routing } = await service
    .from('routing')
    .select(venueCols)
    .eq('id', opts.routingId)
    .maybeSingle<RoutingVenueSource>();

  let canonical: CanonicalHints | null = null;
  if (routing) {
    const v = resolveVenue(routing);
    canonical = { address: v.address, city: v.city, capacity: v.capacity, phone: v.phone };
  }

  let prior: PriorAdvanceSource | null = null;
  const canonId = routing?.canonical_venue_id ?? null;
  const venueName = routing?.venue_name ?? null;
  const curDate = routing?.date ?? null;

  if (canonId || venueName) {
    let q = service
      .from('routing')
      .select('id, date, tours!inner(id, name, workspace_id)')
      .neq('id', opts.routingId)
      .eq('tours.workspace_id', opts.workspaceId)
      .order('date', { ascending: false })
      .limit(30);
    q = canonId ? q.eq('canonical_venue_id', canonId) : q.eq('venue_name', venueName as string);
    if (curDate) q = q.lt('date', curDate);
    const { data: priorRoutings } = await q;

    for (const r of (priorRoutings ?? []) as Array<{ id: string; date: string | null; tours?: { name?: string } | { name?: string }[] }>) {
      const { data: inst } = await service
        .from('advance_instances')
        .select('data')
        .eq('routing_id', r.id)
        .maybeSingle<{ data: AdvanceData | null }>();
      if (inst?.data && Object.keys(inst.data).length > 0) {
        const tourName = Array.isArray(r.tours) ? r.tours[0]?.name : (r.tours as { name?: string } | undefined)?.name;
        prior = {
          data: inst.data,
          label: `From your ${monthLabel(r.date)} show${tourName ? ` · ${tourName}` : ''}`,
        };
        break;
      }
    }
  }

  return { canonical, prior };
}
