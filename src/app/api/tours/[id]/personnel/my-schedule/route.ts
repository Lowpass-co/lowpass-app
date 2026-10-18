/* ============================================
   LOWPASS — /api/tours/[id]/personnel/my-schedule (Sprint 9 §6)

   GET — returns the caller's tour_personnel rows for this tour
         (joined to tour + routing) + their pay (Payroll's figures). Used by
         the crew read-only view at /operations/[tourId]/personnel.

   Resolution path:
     auth.uid() → personnel.user_id (in active workspace) →
     personnel.id (== persons.id by convention) →
     tour_personnel rows for this tour.

   FLIGHTS and HOTELS are deferred to Sprint 10 per the Phase 6
   scope reduction; this endpoint returns only SHOWS + PAY data.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';
// Crew pay = Payroll's own per-person figures (Oct 2026).
import { loadPayrollExportData } from '@/lib/export/payroll-data';

export const dynamic = 'force-dynamic';

interface ShowEntry {
  routing_id: string;
  date: string;
  city: string;
  venue_name: string | null;
  day_type: string;
  /** Whether the day falls within the caller's assignment window. */
  in_window: boolean;
}

interface MyScheduleResponse {
  tour: { id: string; name: string; start_date: string | null; end_date: string | null };
  person: { id: string; display_name: string };
  assignment: {
    role: string;
    starts_on: string | null;
    ends_on: string | null;
    status: string;
  } | null;
  /** Oct 2026 — the SAME figures Payroll shows for this person (one formula,
   *  one place rates are typed), in the tour's currency. Null when there's no
   *  rate card or it couldn't be computed. */
  pay: {
    currency: string;
    fee: number | null;
    perDiem: number | null;
    total: number | null;
    days_in_window: number;
  };
  shows: ShowEntry[];
}

function daysBetweenInclusive(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  const start = new Date(a).getTime();
  const end = new Date(b).getTime();
  if (isNaN(start) || isNaN(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tourId } = await params;

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  const grants = await fetchActiveGrants(supabase, membership, user.id);
  // Crew users access via my_schedule — admin/manager pass too.
  // operations.personnel.my_schedule is the resource_id; the
  // 'crew' tag-mediated grant created at member-edit time
  // covers it.
  if (!canAccess(membership, grants, 'page', 'operations.personnel.my_schedule', 'read')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, name, start_date, end_date, currency, artist_id')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const tourFull = tour as { id: string; name: string; start_date: string | null; end_date: string | null; currency: string | null; artist_id: string | null };
  const tourCurrency = (tourFull.currency || 'GBP').toUpperCase();
  const tourRow = tour as {
    id: string;
    name: string;
    start_date: string | null;
    end_date: string | null;
  };

  // Resolve user → personnel → person in active workspace.
  //
  // Convention (per migration 078 comment block + Adam's Batch 1
  // review note): personnel.id == persons.id for matching rows
  // — they share UUIDs. There is NO personnel.person_id column.
  // Use personnel.id as the join key into persons + tour_personnel.
  const { data: personnel } = await supabase
    .from('personnel')
    .select('id, name')
    .eq('user_id', user.id)
    .eq('workspace_id', membership.workspace_id)
    .limit(1)
    .maybeSingle();

  if (!personnel) {
    // Caller has access to the resource but isn't linked to a
    // personnel record in this workspace. Empty schedule.
    return NextResponse.json<MyScheduleResponse>({
      tour: tourRow,
      person: { id: '', display_name: user.email ?? 'You' },
      assignment: null,
      pay: { currency: tourCurrency, fee: null, perDiem: null, total: null, days_in_window: 0 },
      shows: [],
    });
  }
  const pn = personnel as { id: string; name: string };
  const personId = pn.id; // shared UUID with persons.id by convention

  let displayName = pn.name;
  let assignment: MyScheduleResponse['assignment'] = null;
  let pay: MyScheduleResponse['pay'] = { currency: tourCurrency, fee: null, perDiem: null, total: null, days_in_window: 0 };

  if (personId) {
    const { data: person } = await supabase
      .from('persons')
      .select('id, full_name, preferred_name')
      .eq('id', personId)
      .maybeSingle();
    if (person) {
      const p = person as {
        id: string;
        full_name: string;
        preferred_name: string | null;
      };
      displayName = p.preferred_name?.trim() || p.full_name?.trim() || displayName;
    }

    const { data: tp } = await supabase
      .from('tour_personnel')
      .select(
        // The frozen daily-rate column is intentionally NOT selected — crew pay
        // reads the SSOT (personnel_rate_lines) below; it is retired in migration 231.
        'role, employment_type, starts_on, ends_on, status',
      )
      .eq('tour_id', tourId)
      .eq('person_id', personId)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tp) {
      const a = tp as {
        role: string;
        starts_on: string | null;
        ends_on: string | null;
        status: string;
      };
      assignment = {
        role: a.role,
        starts_on: a.starts_on,
        ends_on: a.ends_on,
        status: a.status,
      };
      const days = daysBetweenInclusive(a.starts_on, a.ends_on);

      // Oct 2026 — pay is Payroll's own figure for this person (the export
      // loader runs the same fees engine over the same rate lines and painted
      // days), not a separate "daily rate × calendar days" estimate.
      const { data: cards } = await supabase
        .from('personnel_rates')
        .select('id')
        .eq('tour_id', tourId)
        .or(`person_id.eq.${personId},roster_personnel_id.eq.${personId}`)
        .limit(1);
      const cardId = ((cards ?? []) as Array<{ id: string }>)[0]?.id ?? null;
      let fee: number | null = null;
      let perDiem: number | null = null;
      let total: number | null = null;
      if (cardId) {
        try {
          const data = await loadPayrollExportData(supabase, tourFull, membership.workspace_id, { selectedIds: [cardId] });
          const me = data.persons.find((x) => x.id === cardId);
          if (me) {
            fee = me.fee;
            perDiem = me.perDiemTotal;
            total = me.total;
          }
        } catch {
          /* pay stays null — the schedule itself still renders */
        }
      }
      pay = { currency: tourCurrency, fee, perDiem, total, days_in_window: days };
    }
  }

  // Routing list for the tour. Each row is a show (day_type=show)
  // or a non-show day (travel/off/rehearsal/etc). The crew view
  // shows them all so the user sees their tour schedule end-to-end.
  const { data: routing } = await supabase
    .from('routing')
    .select('id, date, day_type, city, venue_name')
    .eq('tour_id', tourId)
    .order('date');

  const startWin = assignment?.starts_on ? new Date(assignment.starts_on).getTime() : null;
  const endWin = assignment?.ends_on ? new Date(assignment.ends_on).getTime() : null;

  const shows: ShowEntry[] = ((routing ?? []) as Array<{
    id: string;
    date: string;
    day_type: string | null;
    city: string | null;
    venue_name: string | null;
  }>).map((r) => {
    const ts = new Date(r.date).getTime();
    const inWindow =
      startWin != null && endWin != null && ts >= startWin && ts <= endWin;
    return {
      routing_id: r.id,
      date: r.date,
      city: r.city ?? '',
      venue_name: r.venue_name,
      day_type: r.day_type ?? '',
      in_window: inWindow,
    };
  });

  const response: MyScheduleResponse = {
    tour: tourRow,
    person: { id: personId, display_name: displayName },
    assignment,
    pay,
    shows,
  };
  return NextResponse.json(response);
}
