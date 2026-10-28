/* ============================================
   loadAdvanceShow — one show's advance, for the show page.

   Sections come from the show's own form config (TM-only marked), else from
   the template its day type gets (not yet started — nothing is written until
   the first edit). Hotel / travel / deal facts are read from their own pages'
   tables and shown read-only; the advance never stores a copy.
   ============================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  dayChanges,
  questionSections,
  requestLabel,
  requestState,
  summariseShow,
  type AdvData,
  type AdvSection,
  type IntakeLinkLite,
  type RequestState,
  type ShowSummary,
} from '@/lib/advance/board';
import { resolveAdvanceVenue, type AdvanceVenueSection } from '@/lib/advance/venue';
import type { RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { markTmOnly } from './advanceSections';
import { ROUTING_VENUE_SELECT } from './board';
import { loadTemplateSet, templateForDay, type AdvTemplate } from './templates';

export interface FieldSource {
  kind: 'pack' | 'venue' | 'previous' | 'you';
  doc_id?: string;
  file_name?: string;
  page?: number;
  quote?: string;
  at?: string;
}

export interface PendingAnswer {
  id: string;
  section_id: string;
  field_id: string;
  value: unknown;
  source: string | null;
}

export interface AdvDocument {
  id: string;
  file_name: string;
  mime_type: string | null;
  page_count: number | null;
  answers_used: number;
  created_at: string;
}

export interface LinkedFacts {
  hotels: { name: string; checkIn: string | null; checkOut: string | null; rooms: number }[];
  flights: { label: string; at: string | null }[];
  deal: { title: string; status: string } | null;
}

export interface AdvanceShowData {
  tour: { id: string; name: string; workspaceId: string; artistName: string | null };
  routing: { id: string; date: string; dayType: string; city: string | null };
  venue: { name: string | null; address: string | null; phone: string | null; website: string | null; city: string | null };
  instanceId: string | null;
  formConfigId: string | null;
  template: { id: string; name: string } | null;
  templateSections: AdvSection[] | null;
  /** All sections on the day, contacts and legacy linked ones included (for Customise). */
  allSections: AdvSection[];
  /** The question sections, in order. */
  sections: AdvSection[];
  contactsSection: AdvSection | null;
  data: AdvData;
  sources: Record<string, FieldSource>;
  pending: PendingAnswer[];
  summary: ShowSummary;
  request: RequestState & { label: string; token: string | null; linkId: string | null; recipientName: string | null; recipientEmail: string | null };
  linked: LinkedFacts;
  documents: AdvDocument[];
  changes: ReturnType<typeof dayChanges>;
  lastUpdatedAt: string | null;
}

type RoutingRow = RoutingVenueSource & { id: string; date: string; day_type: string | null; tour_id: string };

export async function loadAdvanceShow(
  client: SupabaseClient,
  tourId: string,
  routingId: string,
  now = Date.now(),
): Promise<AdvanceShowData | null> {
  const [{ data: tour }, { data: routingRow }] = await Promise.all([
    client.from('tours').select('id, name, workspace_id, artist_id').eq('id', tourId).maybeSingle<{
      id: string;
      name: string;
      workspace_id: string;
      artist_id: string | null;
    }>(),
    client.from('routing').select(`${ROUTING_VENUE_SELECT}, tour_id`).eq('id', routingId).eq('tour_id', tourId).maybeSingle(),
  ]);
  if (!tour || !routingRow) return null;
  const routing = routingRow as RoutingRow;

  const [set, { data: inst }, { data: artist }] = await Promise.all([
    loadTemplateSet(client, tour.workspace_id),
    client
      .from('advance_instances')
      .select('id, form_config_id, data, field_sources, last_updated_at')
      .eq('routing_id', routingId)
      .maybeSingle<{ id: string; form_config_id: string | null; data: AdvData | null; field_sources: Record<string, FieldSource> | null; last_updated_at: string | null }>(),
    tour.artist_id
      ? client.from('artists').select('name').eq('id', tour.artist_id).maybeSingle<{ name: string }>()
      : Promise.resolve({ data: null }),
  ]);

  let cfg: { id: string; sections: AdvSection[] | null; layout_template_id: string | null } | null = null;
  if (inst?.form_config_id) {
    const { data, error } = await client
      .from('advance_form_configs')
      .select('id, sections, layout_template_id')
      .eq('id', inst.form_config_id)
      .maybeSingle<{ id: string; sections: AdvSection[] | null; layout_template_id: string | null }>();
    if (error) throw new Error(`advance show config: ${error.message}`);
    cfg = data;
  }
  const tpl: AdvTemplate | null = cfg?.layout_template_id
    ? set.templates.find((t) => t.id === cfg!.layout_template_id) ?? null
    : templateForDay(set, routing.day_type);
  const rawSections = cfg ? (Array.isArray(cfg.sections) ? cfg.sections : []) : tpl?.sections ?? [];
  const [allSections] = await markTmOnly(client, [rawSections]);

  const data = inst?.data ?? {};
  const [{ data: pendRows }, { data: linkRows }, { data: hotelRows }, { data: flightRows }, { data: dealRows }, { data: docRows }] =
    await Promise.all([
      inst
        ? client
            .from('intake_pending_answers')
            .select('id, section_id, field_id, value, source')
            .eq('advance_instance_id', inst.id)
            .eq('status', 'pending')
        : Promise.resolve({ data: [] }),
      client
        .from('advance_intake_links')
        .select('id, token, status, created_at, sent_at, last_viewed_at, submitted_at, revoked_at, expires_at, recipient_name, recipient_email')
        .eq('tour_id', tourId)
        .eq('routing_id', routingId)
        .order('created_at', { ascending: false }),
      client.from('hotels').select('name, check_in_at, check_out_at, rooms(id)').eq('show_id', routingId),
      client
        .from('flights')
        .select('airline, flight_number, origin_airport, destination_airport, depart_at, arrive_at, show_id')
        .eq('tour_id', tourId)
        .order('depart_at', { ascending: true }),
      client.from('deal_memos').select('title, status').eq('show_id', routingId),
      client
        .from('advance_documents')
        .select('id, file_name, mime_type, page_count, answers_used, created_at')
        .eq('routing_id', routingId)
        .order('created_at', { ascending: false }),
    ]);

  const pending = (pendRows ?? []) as PendingAnswer[];
  const pendBySection: Record<string, number> = {};
  for (const p of pending) pendBySection[p.section_id] = (pendBySection[p.section_id] ?? 0) + 1;

  const links = (linkRows ?? []) as (IntakeLinkLite & { id: string; token: string; recipient_name: string | null; recipient_email: string | null })[];
  const pre = requestState(links, 0, false, now);
  const summary = summariseShow(allSections, data, pendBySection, pre.live);
  const req = requestState(links, summary.toReview, summary.complete, now);
  const latest = links.find((l) => l.status !== 'revoked' && !l.revoked_at) ?? null;

  const venue = resolveAdvanceVenue(routing, allSections as unknown as AdvanceVenueSection[], data);
  const day = routing.date;
  const flights = ((flightRows ?? []) as Record<string, string | null>[])
    .filter((f) => f.show_id === routingId || f.depart_at?.slice(0, 10) === day || f.arrive_at?.slice(0, 10) === day)
    .map((f) => ({
      label: [f.airline, f.flight_number].filter(Boolean).join(' ') + (f.origin_airport || f.destination_airport ? ` · ${f.origin_airport ?? '?'} → ${f.destination_airport ?? '?'}` : ''),
      at: f.depart_at ?? null,
    }));

  return {
    tour: { id: tour.id, name: tour.name, workspaceId: tour.workspace_id, artistName: (artist as { name?: string } | null)?.name ?? null },
    routing: { id: routing.id, date: routing.date, dayType: routing.day_type ?? '', city: venue.city ?? routing.city ?? null },
    venue: { name: venue.name, address: venue.address, phone: venue.phone, website: venue.website, city: venue.city },
    instanceId: inst?.id ?? null,
    formConfigId: inst?.form_config_id ?? null,
    template: tpl ? { id: tpl.id, name: tpl.name } : null,
    templateSections: tpl?.sections ?? null,
    allSections,
    sections: questionSections(allSections),
    contactsSection: allSections.find((s) => s.label.trim().toLowerCase() === 'key contacts') ?? null,
    data,
    sources: inst?.field_sources ?? {},
    pending,
    summary,
    request: {
      ...req,
      label: requestLabel(req, now),
      token: latest?.token ?? null,
      linkId: latest?.id ?? null,
      recipientName: latest?.recipient_name ?? null,
      recipientEmail: latest?.recipient_email ?? null,
    },
    linked: {
      hotels: ((hotelRows ?? []) as { name: string; check_in_at: string | null; check_out_at: string | null; rooms: unknown[] | null }[]).map((h) => ({
        name: h.name,
        checkIn: h.check_in_at,
        checkOut: h.check_out_at,
        rooms: Array.isArray(h.rooms) ? h.rooms.length : 0,
      })),
      flights,
      deal: ((dealRows ?? []) as { title: string; status: string }[]).map((d) => ({ title: d.title, status: d.status }))[0] ?? null,
    },
    documents: (docRows ?? []) as AdvDocument[],
    changes: cfg && tpl ? dayChanges(allSections, tpl.sections) : { off: [], added: [], addedQuestions: 0 },
    lastUpdatedAt: inst?.last_updated_at ?? null,
  };
}
