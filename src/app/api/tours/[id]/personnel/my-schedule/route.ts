/* ============================================
   LOWPASS — /api/tours/[id]/personnel/my-schedule (Sprint 9 §6)

   GET — returns the caller's tour_personnel rows for this tour
         (joined to tour + routing) + their daily rate. Used by
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
// Rates SSOT (Part A) — crew pay now reads personnel_rate_lines, not the
// competing tour_personnel.rate_amount. See RATES_SSOT_DISCOVERY_2026-07-03 §3.
import { DEFAULT_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

export const dynamic = 'force-dynamic';

/** The crew estimate's single daily fee, sourced from the SSOT (personnel_rate_lines):
 *  a day-rate person's flat daily is their a6 "Day rate" line; a split person's is
 *  their a1 "Show" line. Falls back to the frozen legacy columns for any card not
 *  yet backfilled (migration 230), so the number is stable before + after apply.
 *  Basis is unchanged (× calendar days in window) — only the rate SOURCE moves,
 *  so only crew whose stored rate_amount disagreed with this figure change. */
function ssotDailyRate(
  card: { rate_type: string | null; show_rate: number | string | null; off_rate: number | string | null } | null,
  lineByType: Map<string, number>,
): number {
  if (!card) return 0;
  const isDayRate = (card.rate_type ?? '') === 'day_rate';
  if (isDayRate) {
    const a6 = lineByType.get(DEFAULT_RATE_TYPE_IDS.dayRate);
    return a6 != null ? a6 : Number(card.off_rate) || 0;
  }
  const a1 = lineByType.get(DEFAULT_RATE_TYPE_IDS.show);
  return a1 != null ? a1 : Number(card.show_rate) || 0;
}

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
  pay: {
    rate_amount: number | null;
    rate_currency: string | null;
    rate_period: string | null;
    days_in_window: number;
    total_expected: number | null;
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
    .select('id, name, start_date, end_date')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
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
      pay: {
        rate_amount: null,
        rate_currency: null,
        rate_period: null,
        days_in_window: 0,
        total_expected: null,
      },
      shows: [],
    });
  }
  const pn = personnel as { id: string; name: string };
  const personId = pn.id; // shared UUID with persons.id by convention

  let displayName = pn.name;
  let assignment: MyScheduleResponse['assignment'] = null;
  let pay: MyScheduleResponse['pay'] = {
    rate_amount: null,
    rate_currency: null,
    rate_period: null,
    days_in_window: 0,
    total_expected: null,
  };

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
        // rate_amount is intentionally NOT selected — crew pay reads the SSOT
        // (personnel_rate_lines) below. The column is retired in migration 231.
        'role, employment_type, rate_currency, rate_period, starts_on, ends_on, status',
      )
      .eq('tour_id', tourId)
      .eq('person_id', personId)
      .order('role', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (tp) {
      const a = tp as {
        role: string;
        rate_currency: string | null;
        rate_period: string | null;
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

      // Rates SSOT — the daily fee now comes from the person's rate lines, not
      // the frozen tour_personnel.rate_amount. Load the card + its a1/a6 lines.
      const { data: card } = await supabase
        .from('personnel_rates')
        .select('id, rate_type, show_rate, off_rate')
        .eq('tour_id', tourId)
        .eq('person_id', personId)
        .maybeSingle<{ id: string; rate_type: string | null; show_rate: number | string | null; off_rate: number | string | null }>();
      const lineByType = new Map<string, number>();
      if (card?.id) {
        const { data: lineRows } = await supabase
          .from('personnel_rate_lines')
          .select('rate_type_id, amount')
          .eq('personnel_rate_id', card.id)
          .in('rate_type_id', [DEFAULT_RATE_TYPE_IDS.show, DEFAULT_RATE_TYPE_IDS.dayRate]);
        for (const l of (lineRows ?? []) as Array<{ rate_type_id: string; amount: number | string | null }>) {
          lineByType.set(l.rate_type_id, Number(l.amount) || 0);
        }
      }
      const dailyRate = ssotDailyRate(card, lineByType);
      // Basis unchanged: daily rate × calendar days in the assignment window,
      // gated on a day-period assignment exactly as before.
      const total = dailyRate > 0 && a.rate_period === 'day' && days > 0 ? dailyRate * days : null;
      pay = {
        rate_amount: dailyRate > 0 ? dailyRate : null,
        rate_currency: a.rate_currency,
        rate_period: a.rate_period,
        days_in_window: days,
        total_expected: total,
      };
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
