/* ============================================================
   LOWPASS — Advance · Share surface (P3 · B4 · VIS-AS)

   Replaces the B1 redirect-to-/packet with the real Share surface. Server
   component: fetches the advance instance's sections so the venue-view preview
   can show which sections a venue sees vs. which are TM-only (hidden), and
   derives the venue-fillable counts via buildIntakeFormSchema (the same schema
   the public intake form uses). No raw venue_* reads — sections are structural.
   ============================================================ */

import { notFound, redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveArtistLogoUrlSync } from '@/lib/artists/imageUrl';
import { resolveVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import {
  buildIntakeFormSchema,
  type IntakeSection,
} from '@/lib/advance/intake';
import {
  ShareSurface,
  type ShareSectionView,
  type ShareActivityEvent,
  type PacketArtifact,
} from '@/components/advance/ShareSurface';

export const dynamic = 'force-dynamic';

const NON_FILLABLE = new Set(['file', 'contact']);

export default async function AdvanceSharePage({
  params,
}: {
  params: Promise<{ tourId: string; routingId: string }>;
}) {
  const { tourId, routingId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/advance/${tourId}/${routingId}/share`);

  const { data: instance } = await supabase
    .from('advance_instances')
    .select('id, sections')
    .eq('routing_id', routingId)
    .maybeSingle();
  if (!instance) notFound();

  const rawSections = ((instance as { sections?: unknown }).sections ??
    []) as IntakeSection[];

  // Venue-fillable schema (drops tm_only sections + file/contact fields) — the
  // exact set the public intake form exposes.
  const venueSchema = buildIntakeFormSchema(rawSections);
  const fillableByTemplate = new Map(
    venueSchema.sections.map((s) => [s.template_id, s.fields.length]),
  );
  const fillableTotal = venueSchema.sections.reduce(
    (n, s) => n + s.fields.length,
    0,
  );

  // Per-section view for the preview — EVERY section is listed (tm_only shown as
  // hidden, never omitted).
  const sectionViews: ShareSectionView[] = rawSections.map((s) => {
    const total = (s.fields ?? []).length;
    const fillable = s.tm_only
      ? 0
      : fillableByTemplate.get(s.template_id) ??
        (s.fields ?? []).filter((f) => !NON_FILLABLE.has(f.type)).length;
    return {
      templateId: s.template_id,
      label: s.label,
      tmOnly: !!s.tm_only,
      totalFields: total,
      venueFillable: fillable,
    };
  });

  // VIS-AS-05 — real activity from the intake link's persisted timestamps.
  // opened = last_viewed_at, submitted = submitted_at. Downloads aren't tracked
  // (no events table) so they're never fabricated here — ShareSurface flags them.
  const { data: links } = await supabase
    .from('advance_intake_links')
    .select('last_viewed_at, submitted_at, submitted_by_name, status, revoked_at')
    .eq('tour_id', tourId)
    .eq('routing_id', routingId)
    .order('created_at', { ascending: false });

  const activity: ShareActivityEvent[] = [];
  for (const l of (links ?? []) as {
    last_viewed_at: string | null;
    submitted_at: string | null;
    submitted_by_name: string | null;
    status: string | null;
    revoked_at: string | null;
  }[]) {
    if (l.revoked_at) continue;
    if (l.submitted_at) {
      activity.push({ kind: 'submitted', at: l.submitted_at, who: l.submitted_by_name });
    }
    if (l.last_viewed_at) {
      activity.push({ kind: 'opened', at: l.last_viewed_at });
    }
  }
  // Newest first.
  activity.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // ── Header identity: artist (+ artwork) + this show's date / venue ──────────
  const { data: tour } = await supabase
    .from('tours')
    .select('name, artist_id, artists(name, branding, spotify_id, spotify_image_url)')
    .eq('id', tourId)
    .maybeSingle();
  const artistRow = (Array.isArray(tour?.artists) ? tour?.artists[0] : tour?.artists) as
    | { name?: string | null; branding?: unknown; spotify_id?: string | null; spotify_image_url?: string | null }
    | null;
  const artist = {
    name: artistRow?.name ?? null,
    imageUrl: artistRow ? resolveArtistLogoUrlSync(artistRow) : null,
  };

  const { data: routingRow } = await supabase
    .from('routing')
    .select('date, city, country, address, venue_name, venue_capacity, venue_website, venue_phone, venue_frozen_at, canonical_venue_id, canonical:canonical_venues(id, name, address, city, country, capacity)')
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();
  const resolvedVenue = routingRow ? resolveVenue(routingRow as RoutingVenueSource) : null;
  const show = {
    date: (routingRow?.date as string | null) ?? null,
    venue: resolvedVenue?.name ?? null,
    city: resolvedVenue?.city ?? (routingRow?.city as string | null) ?? null,
  };

  // ── Packet artifacts: one downloadable PDF per thing the venue needs. Riders
  //    (production + hospitality, by title) + stage plots are per-pack; channel
  //    list is one tour-keyed export; the day sheet is this show's. All lead to
  //    existing branded PDF routes — assembly, not new builders. ───────────────
  const { data: packs } = await supabase
    .from('rider_packs')
    .select('id, title, kind, scope')
    .eq('tour_id', tourId)
    .order('scope', { ascending: true })
    .order('title', { ascending: true });

  const artifacts: PacketArtifact[] = [];
  let hasChannelList = false;
  for (const p of (packs ?? []) as Array<{ id: string; title: string | null; kind: string }>) {
    const title = p.title?.trim() || '';
    if (p.kind === 'rider') {
      artifacts.push({ key: `rider-${p.id}`, kind: 'rider', title: title || 'Rider', href: `/api/rider-packs/${p.id}/pdf`, method: 'GET' });
    } else if (p.kind === 'stage_plot') {
      artifacts.push({ key: `plot-${p.id}`, kind: 'stage_plot', title: title || 'Stage plot', href: `/api/stage-plots/${p.id}/export/pdf`, method: 'POST' });
    } else if (p.kind === 'channel_list') {
      hasChannelList = true;
    }
  }
  if (hasChannelList) {
    artifacts.push({ key: 'channel-list', kind: 'channel_list', title: 'Channel list', href: `/api/channel-list/${tourId}/export/pdf`, method: 'POST' });
  }
  // The day sheet always applies (we're on a routing row).
  artifacts.push({ key: 'daysheet', kind: 'daysheet', title: 'Day sheet', href: `/api/day/${routingId}/export/pdf`, method: 'POST' });

  // Riders first (production/hospitality), then stage plot, channel list, day sheet.
  const order: Record<PacketArtifact['kind'], number> = { rider: 0, stage_plot: 1, channel_list: 2, daysheet: 3 };
  artifacts.sort((a, b) => order[a.kind] - order[b.kind]);

  return (
    <ShareSurface
      tourId={tourId}
      routingId={routingId}
      artist={artist}
      tourName={(tour?.name as string | null) ?? null}
      show={show}
      artifacts={artifacts}
      sections={sectionViews}
      fillableTotal={fillableTotal}
      activity={activity}
    />
  );
}
