/* ============================================================
   LOWPASS — Advance per-show layout (P3 · B1)

   Mounts the Build / Advance / Share segmented switcher above every per-show
   surface so all three are reachable from one control. The switcher is a client
   component (pathname/searchParams-aware); this server layout just threads the
   route params to it.
   ============================================================ */

import type { ReactNode } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { AdvanceModeSwitcher } from '@/components/advance/AdvanceModeSwitcher';

function formatShowDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });
}

export default async function AdvanceShowLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;

  // VIS-AB-01 — resolve the show (venue/date) + active template so the
  // switcher can render a breadcrumb tail + template chip. Mirrors the
  // access paths in the sibling page.tsx; kept lightweight (venue + config
  // name only) so it doesn't duplicate the page's full render.
  const supabase = await createServerSupabaseClient();
  const { data: routingRaw } = await supabase
    .from('routing')
    .select(
      'id, date, day_type, city, country, address, venue_name, venue_website, venue_phone, venue_capacity, canonical_venue_id, venue_frozen_at, canonical:canonical_venues(id, name, address, city, country, capacity)',
    )
    .eq('id', routingId)
    .maybeSingle();

  let showName: string | null = null;
  let dateLabel: string | null = null;
  if (routingRaw) {
    const v = resolveVenue(routingRaw as RoutingVenueSource);
    showName = v.name || v.city || null;
    dateLabel = formatShowDate((routingRaw as { date?: string | null }).date);
  }

  const { data: advance } = await supabase
    .from('advance_instances')
    .select('form_config_id')
    .eq('routing_id', routingId)
    .maybeSingle();
  let templateName: string | null = null;
  const formConfigId = (advance as { form_config_id?: string | null } | null)?.form_config_id;
  if (formConfigId) {
    const { data: config } = await supabase
      .from('advance_form_configs')
      .select('name')
      .eq('id', formConfigId)
      .maybeSingle();
    templateName = (config as { name?: string | null } | null)?.name?.trim() || null;
  }

  return (
    <>
      <AdvanceModeSwitcher
        tourId={tourId}
        routingId={routingId}
        showName={showName}
        dateLabel={dateLabel}
        templateName={templateName}
      />
      {children}
    </>
  );
}
