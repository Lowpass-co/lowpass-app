/* ============================================
   LOWPASS — Operations · Rooming (Phase 4 unblock)

   /operations/[tourId]/rooming — the live rooming grid + per-hotel sheets.
   Ports /tours/[id]/rooming, rendering inner content only (ProductShell +
   TourHeader come from /operations/[tourId]/layout.tsx).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoomingView } from '@/components/rooming/RoomingView';

export const dynamic = 'force-dynamic';

export default async function OperationsTourRoomingPage({
  params,
}: {
  params: Promise<{ tourId: string }>;
}) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: tour, error: tourError } = await supabase
    .from('tours')
    .select('id, name, currency, workspace_id')
    .eq('id', tourId)
    .single();

  if (tourError || !tour) notFound();

  const [routingRes, hotelsRes, rosterRes] = await Promise.all([
    supabase.from('routing').select('*').eq('tour_id', tourId).order('date', { ascending: true }),
    supabase
      .from('hotels')
      .select('*, rooms(*, room_assignments(*, persons(full_name)))')
      .eq('tour_id', tourId)
      .eq('workspace_id', tour.workspace_id)
      .order('check_in_at', { ascending: true, nullsFirst: true }),
    // Personnel unification — FOUNDATION FIX. ROW SOURCE is the roster
    // (`tour_personnel`), not the rate cards. Every roster member is a
    // rooming row even with no rate card and no room. (The grid's own
    // off-roster occupants — people holding a room but NOT on the roster,
    // e.g. Duncan — are surfaced separately by the grid, never as a phantom
    // roster row.)
    supabase
      .from('tour_personnel')
      .select('id, person_id, role, created_at')
      .eq('tour_id', tourId)
      .order('created_at', { ascending: true }),
  ]);

  const routingDates = routingRes.data ?? [];
  const rosterRows = (rosterRes.data ?? []) as Array<{
    id: string;
    person_id?: string | null;
    role?: string | null;
  }>;
  // Person ids on the tour roster — assignments for anyone else are hidden
  // (e.g. an off-tour person who still holds a room). person_id is robust
  // whether or not the assignment carries a tour_personnel_id yet.
  const rosterPersonIds = new Set(
    rosterRows.map((r) => r.person_id).filter((id): id is string => Boolean(id)),
  );

  // Names for the roster (full_name = the canonical key the grid + POST use).
  const nameByPersonId = new Map<string, string>();
  if (rosterPersonIds.size > 0) {
    const { data: personsRows } = await supabase
      .from('persons')
      .select('id, full_name, preferred_name')
      .in('id', Array.from(rosterPersonIds));
    for (const p of (personsRows ?? []) as Array<{ id: string; full_name?: string | null; preferred_name?: string | null }>) {
      nameByPersonId.set(p.id, p.full_name?.trim() || p.preferred_name?.trim() || '');
    }
  }

  // The authoritative people list for the master grid: one row per roster
  // member. person_name matches persons.full_name so cells/saves resolve.
  const roster = rosterRows.map((r) => ({
    person_id: r.person_id ?? null,
    person_name: (r.person_id ? nameByPersonId.get(r.person_id) : '') || r.role || 'Unknown',
    role: r.role ?? '',
  }));
  const hotelsRaw = (hotelsRes.data ?? []) as Array<{
    id: string;
    tour_id: string;
    name: string;
    address?: string | null;
    phone?: string | null;
    city?: string | null;
    notes?: string | null;
    rooms?: Array<{
      id: string;
      room_type?: string | null;
      room_number?: string | null;
      cost_amount?: number | null;
      notes?: string | null;
      room_assignments?: Array<{
        id: string;
        person_id?: string | null;
        starts_on: string;
        ends_on: string;
        persons?: { full_name?: string | null } | Array<{ full_name?: string | null }> | null;
      }>;
    }>;
  }>;

  const hotels = hotelsRaw.map((h) => ({
    id: h.id,
    tour_id: h.tour_id,
    hotel_name: h.name,
    address: h.address ?? null,
    city: h.city ?? null,
    phone: h.phone ?? null,
    cancellation_policy: h.notes ?? null,
    room_assignments: (h.rooms ?? []).flatMap((room) =>
      (room.room_assignments ?? [])
        // Only roster members' assignments render (kills the off-tour
        // occupant bug). If a person isn't yet linked to canonical
        // `persons` (null person_id) keep them visible rather than
        // silently dropping data.
        .filter((ra) => !ra.person_id || rosterPersonIds.has(ra.person_id))
        .map((ra) => {
        const person = Array.isArray(ra.persons) ? ra.persons[0] : ra.persons;
        const checkIn = ra.starts_on;
        const checkOut = ra.ends_on;
        const nights = Math.max(
          0,
          Math.round(
            (new Date(`${checkOut}T12:00:00`).getTime() - new Date(`${checkIn}T12:00:00`).getTime()) /
              (24 * 60 * 60 * 1000)
          )
        );
        return {
          id: ra.id,
          // room_id lets the Nights-overview group assignments by ROOM so a
          // shared room is counted + costed once (matching the reconcile feed).
          room_id: room.id,
          person_name: person?.full_name ?? null,
          check_in: checkIn,
          check_out: checkOut,
          nights,
          room_type: room.room_type ?? null,
          room_number: room.room_number ?? null,
          confirmation: null,
          rate_per_night: Number(room.cost_amount ?? 0),
          notes: room.notes ?? null,
        };
      })
    ),
  }));

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 pb-12">
      <RoomingView
        tourId={tour.id}
        tourName={tour.name}
        currency={tour.currency}
        routingDates={routingDates ?? []}
        hotels={hotels}
        roster={roster}
      />
    </div>
  );
}
