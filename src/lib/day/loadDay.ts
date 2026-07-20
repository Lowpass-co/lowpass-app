/* ============================================================
   LOWPASS — The Day: read composition (D1-1)

   ONE server function assembles a routing row's "day" from data we already
   hold — no new tables (Notes reuse routing.notes). Every block is nullable;
   the page renders gracefully with gaps.

   SLICE-ENFORCED SERVER-SIDE. loadDay takes the viewer's role and only queries
   the blocks in their slice (src/lib/roles/slices.ts). Out-of-slice data —
   money (`pnl`) and the internal `notes` — is never fetched, so it is ABSENT
   from the returned object and therefore from the served HTML (not display:none).
   This is the crew-view guarantee Adam verifies.

   Venue is read ONLY through resolveVenue() (house rule). The money chip reuses
   the harness-proven computeWalk via loadTourSettlementWalks — never recomputed.
   ============================================================ */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveVenue, type ResolvedVenue, type RoutingVenueSource } from '@/lib/venues/resolveVenue';
import { loadTourSettlementWalks } from '@/lib/settlement/loadWalk';
import {
  extractDayContacts,
  type SectionDef,
  type KeyContactCard,
} from '@/lib/advance/key-info';
import { sliceFor, type TourRole, type RoleSlice, type DayBlock } from '@/lib/roles/slices';

/** One row in the merged day timeline, tagged with where it came from. */
export interface ScheduleItem {
  /** 'HH:MM' 24h, or null (an untimed / TBC entry). */
  time: string | null;
  /** ~ approximate (labor call flagged approx). */
  approx: boolean;
  label: string;
  detail: string | null;
  source: 'labor_call' | 'advance';
}

export interface DayHotel {
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  confirmationNumber: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  notes: string | null;
}

export interface DayFlight {
  who: string | null;
  airline: string | null;
  flightNumber: string | null;
  pnr: string | null;
  from: string;
  to: string;
  departAt: string;
  arriveAt: string;
  notes: string | null;
}

export interface DayContact {
  name: string;
  role: string;
  phone: string | null;
  email: string | null;
  /** Day-of contacts are the SHOW's people, not the tour roster: 'advance' = a
   *  venue contact captured in the advance; 'deal_memo' = the promoter on the
   *  show's deal memo. The roster lives in Crew, never on the Day. */
  source: 'advance' | 'deal_memo';
}

/** Compact money chip — gated to slices with `pnl` (tm / accountant / management).
 *  Links out to Budget; deliberately tiny (the Day is not a P&L surface). */
export interface DayPnl {
  currency: string;
  guarantee: number | null;
  showNet: number | null;
}

export interface DayObject {
  tourId: string;
  routingId: string;
  date: string | null;
  city: string | null;
  dayType: string | null;
  tourName: string | null;
  artistName: string | null;
  /** The slice this object was built for — the renderer echoes it (never widens). */
  role: TourRole;
  slice: { blocks: DayBlock[]; products: string[] };
  // Blocks — a field is present ONLY if the slice includes it. Absent (undefined)
  // means "not in this viewer's slice"; null means "in slice but no data".
  venue?: ResolvedVenue | null;
  schedule?: ScheduleItem[] | null;
  hotels?: DayHotel[] | null;
  flights?: DayFlight[] | null;
  contacts?: DayContact[] | null;
  notes?: string | null;
  pnl?: DayPnl | null;
}

const VENUE_SELECT =
  'id, date, day_type, city, country, venue_name, address, venue_phone, venue_website, venue_capacity, ' +
  'canonical_venue_id, venue_frozen_at, notes, ' +
  'canonical:canonical_venues(id, name, address, city, country, capacity)';

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Pull time-typed advance fields into schedule items (load-in / soundcheck /
 *  doors / set — whatever the workspace named its Schedule template). */
function advanceScheduleItems(
  sections: SectionDef[] | null | undefined,
  data: Record<string, Record<string, unknown>> | null | undefined,
): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const section of sections ?? []) {
    const secData = (data ?? {})[section.template_id] ?? {};
    for (const field of section.fields ?? []) {
      if (field.type !== 'time') continue;
      const val = str(secData[field.id]);
      if (!val) continue;
      out.push({
        time: val,
        approx: false,
        label: field.label ?? 'Time',
        detail: null,
        source: 'advance',
      });
    }
  }
  return out;
}

/** Sort a timeline by time (null / untimed last), stable on label. */
function byTime(a: ScheduleItem, b: ScheduleItem): number {
  if (a.time && b.time) return a.time.localeCompare(b.time) || a.label.localeCompare(b.label);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.label.localeCompare(b.label);
}

export interface LoadDayArgs {
  tourId: string;
  routingId: string;
  workspaceId: string;
  role: TourRole;
  /** Tour currency for the money chip; defaults GBP. */
  tourCurrency?: string | null;
  /** Passed to resolveVenue for deterministic freeze in tests. */
  today?: string;
}

/**
 * Compose the Day for `routingId`, scoped to the viewer's role slice. Returns
 * null only if the routing row doesn't exist / isn't in the workspace. Every
 * block is best-effort: a failed sub-load yields null for that block, never a
 * thrown page.
 */
export async function loadDay(
  supabase: SupabaseClient,
  args: LoadDayArgs,
): Promise<DayObject | null> {
  const { tourId, routingId, workspaceId, role } = args;
  const slice: RoleSlice = sliceFor(role);
  const has = (b: DayBlock) => slice.blocks.has(b);

  // Routing row (+ tour/artist meta) — the spine. 404 if absent/foreign.
  const { data: routingData } = await supabase
    .from('routing')
    .select(VENUE_SELECT)
    .eq('id', routingId)
    .eq('tour_id', tourId)
    .maybeSingle();
  // The join-alias select isn't in the generated types → cast to the shape we read.
  const routing = routingData as (RoutingVenueSource & { notes?: string | null }) | null;
  if (!routing) return null;

  const { data: tour } = await supabase
    .from('tours')
    .select('name, currency, artist:artists(name)')
    .eq('id', tourId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const artistRel = (tour?.artist ?? null) as { name?: string | null } | { name?: string | null }[] | null;
  const artistName = Array.isArray(artistRel) ? artistRel[0]?.name ?? null : artistRel?.name ?? null;
  const currency = (args.tourCurrency ?? (tour?.currency as string | null) ?? 'GBP').toUpperCase();

  const day: DayObject = {
    tourId,
    routingId,
    date: (routing.date as string | null) ?? null,
    city: (routing.city as string | null) ?? null,
    dayType: (routing.day_type as string | null) ?? null,
    tourName: (tour?.name as string | null) ?? null,
    artistName,
    role,
    slice: { blocks: [...slice.blocks], products: [...slice.products] },
  };

  // Venue — resolveVenue() ONLY.
  if (has('venue')) {
    day.venue = resolveVenue(routing as RoutingVenueSource, { today: args.today });
  }

  // Schedule — labor calls + advance time fields, one source-tagged timeline.
  if (has('schedule')) {
    const [{ data: calls }, { data: adv }] = await Promise.all([
      supabase
        .from('labor_calls')
        .select('department, call_time, call_time_approx, contact_name, notes, sort_order')
        .eq('routing_id', routingId)
        .order('sort_order', { ascending: true }),
      supabase.from('advance_instances').select('sections, data').eq('routing_id', routingId).maybeSingle(),
    ]);
    const items: ScheduleItem[] = [];
    for (const c of calls ?? []) {
      items.push({
        time: str(c.call_time),
        approx: c.call_time_approx === true,
        label: str(c.department) ?? 'Call',
        detail: str(c.contact_name),
        source: 'labor_call',
      });
    }
    items.push(
      ...advanceScheduleItems(
        (adv?.sections as SectionDef[] | null) ?? null,
        (adv?.data as Record<string, Record<string, unknown>> | null) ?? null,
      ),
    );
    items.sort(byTime);
    day.schedule = items.length ? items : null;
  }

  // Hotel(s) for the night.
  if (has('hotel')) {
    const { data: hotels } = await supabase
      .from('hotels')
      .select('name, address, city, phone, confirmation_number, check_in_at, check_out_at, notes')
      .eq('show_id', routingId)
      .order('check_in_at', { ascending: true });
    day.hotels = (hotels ?? []).length
      ? (hotels ?? []).map((h) => ({
          name: (h.name as string) ?? 'Hotel',
          address: str(h.address),
          city: str(h.city),
          phone: str(h.phone),
          confirmationNumber: str(h.confirmation_number),
          checkInAt: str(h.check_in_at),
          checkOutAt: str(h.check_out_at),
          notes: str(h.notes),
        }))
      : null;
  }

  // Flights touching the date (linked to the show). Header renders as "Flights"
  // — there is no ground-transport table, so the block is scoped, not incomplete.
  if (has('flights')) {
    const { data: flights } = await supabase
      .from('flights')
      .select('airline, flight_number, pnr, origin_airport, destination_airport, depart_at, arrive_at, person_name, notes')
      .eq('show_id', routingId)
      .order('depart_at', { ascending: true });
    day.flights = (flights ?? []).length
      ? (flights ?? []).map((f) => ({
          who: str(f.person_name),
          airline: str(f.airline),
          flightNumber: str(f.flight_number),
          pnr: str(f.pnr),
          from: (f.origin_airport as string) ?? '',
          to: (f.destination_airport as string) ?? '',
          departAt: (f.depart_at as string) ?? '',
          arriveAt: (f.arrive_at as string) ?? '',
          notes: str(f.notes),
        }))
      : null;
  }

  // Day-of contacts = the SHOW's people (venue side), NOT the tour roster: every
  // contact captured in the advance for this show + the deal memo's promoter.
  // No roster query, no money columns.
  if (has('contacts')) {
    const contacts: DayContact[] = [];
    const [{ data: adv }, { data: memos }] = await Promise.all([
      supabase.from('advance_instances').select('sections, data').eq('routing_id', routingId).maybeSingle(),
      supabase.from('deal_memos').select('promoter_name, promoter_email, promoter_phone').eq('show_id', routingId).eq('workspace_id', workspaceId),
    ]);
    if (adv) {
      const venueContacts: KeyContactCard[] = extractDayContacts(
        (adv.sections as SectionDef[] | null) ?? [],
        (adv.data as Record<string, Record<string, unknown>> | null) ?? {},
      );
      for (const c of venueContacts) {
        contacts.push({ name: c.name, role: c.role, phone: c.phone ?? null, email: c.email ?? null, source: 'advance' });
      }
    }
    for (const m of memos ?? []) {
      const name = str(m.promoter_name);
      if (!name) continue;
      contacts.push({ name, role: 'Promoter', phone: str(m.promoter_phone), email: str(m.promoter_email), source: 'deal_memo' });
    }
    day.contacts = contacts.length ? contacts : null;
  }

  // Notes — the internal routing note (gated: tm / production / accountant).
  if (has('notes')) {
    day.notes = str(routing.notes);
  }

  // Money chip — gated (tm / accountant / management). Reuses computeWalk.
  if (has('pnl')) {
    try {
      const walks = await loadTourSettlementWalks(supabase, tourId, workspaceId, currency);
      const w = walks.find((x) => x.routingId === routingId) ?? null;
      day.pnl = w
        ? { currency, guarantee: w.guarantee ?? null, showNet: w.walk?.showNet ?? null }
        : { currency, guarantee: null, showNet: null };
    } catch {
      day.pnl = null;
    }
  }

  return day;
}
