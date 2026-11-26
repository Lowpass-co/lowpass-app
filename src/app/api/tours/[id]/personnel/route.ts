/* ============================================
   LOWPASS — /api/tours/[id]/personnel (Sprint 9 §6; Nov 2026)

   GET  — the tour's crew, with each person's login on this tour. Needs
          Logistics (tour access); invites and others' access come back
          only for admins (RLS).
   POST — put ONE existing person on the crew (admin / manager), through
          addPersonToTour. The Add crew panel uses /personnel/add (many at
          once, new people, logins). Status is retired.

   The Personnel page also calls /conflicts (POST) for
   cross-workspace conflict warnings — separate route.
   ============================================ */

import { NextResponse } from 'next/server';
import { requireWrite } from '@/lib/auth/workspace-check';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
} from '@/lib/permissions/server';
import { getViewerAccess, viewerAllows, runsTour } from '@/lib/permissions/tourAccess';
import { tourFromParams, withDerivedRefresh } from '@/server/budget/withDerivedRefresh';
import { isEmployment, type Employment } from '@/lib/personnel/employment';
import { addPersonToTour } from '@/server/people/addToTour';
import { tourLoginStates, type LoginState } from '@/server/people/tourLogin';

export const dynamic = 'force-dynamic';

interface PersonnelListItem {
  id: string; // tour_personnel.id
  person_id: string;
  workspace_id: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  /** Sprint 12 §9c.0 — structured role discriminator. Mirrors
   *  the shape in src/lib/personnel/types.ts. */
  role_tag: 'tm' | 'tm2' | 'pm' | 'foh' | 'mons' | 'ld' | 'backline' | 'management' | 'other';
  employment: Employment | null;
  rate_currency: string | null;
  rate_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  canonical_person_id: string | null;
  /** Their login on THIS tour (what RLS lets the caller see). */
  login: LoginState;
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
  // Tour access (Nov 2026): the crew list is the Logistics area.
  if (!viewerAllows(await getViewerAccess(supabase, user.id, tourId), 'logistics')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('id, workspace_id')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  const { data: rows, error } = await supabase
    .from('tour_personnel')
    .select(
      /* Sprint 12 §9c.0 — role_tag added to the select so the
         PersonnelListItem shape (and downstream UI) sees it. */
      'id, workspace_id, person_id, role, role_tag, rate_currency, rate_period, starts_on, ends_on',
    )
    .eq('tour_id', tourId)
    .order('role', { ascending: true });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const personIds = Array.from(
    new Set(
      ((rows ?? []) as Array<{ person_id: string }>).map((r) => r.person_id),
    ),
  );
  let personById = new Map<
    string,
    {
      id: string;
      full_name: string;
      preferred_name: string | null;
      email: string | null;
      phone: string | null;
      canonical_person_id: string | null;
    }
  >();
  if (personIds.length > 0) {
    const { data: persons } = await supabase
      .from('persons')
      .select('id, full_name, preferred_name, email, phone, canonical_person_id')
      .in('id', personIds);
    personById = new Map(
      ((persons ?? []) as Array<{
        id: string;
        full_name: string;
        preferred_name: string | null;
        email: string | null;
        phone: string | null;
        canonical_person_id: string | null;
      }>).map((p) => [p.id, p]),
    );
  }

  // Employment (Principal / Band / Crew) is on each member's payroll card.
  const { data: cards } = await supabase
    .from('personnel_rates')
    .select('tour_personnel_id, person_type')
    .eq('tour_id', tourId)
    .not('tour_personnel_id', 'is', null);
  const employmentByMember = new Map<string, Employment>();
  for (const c of (cards ?? []) as Array<{ tour_personnel_id: string | null; person_type: string | null }>) {
    if (c.tour_personnel_id && isEmployment(c.person_type)) employmentByMember.set(c.tour_personnel_id, c.person_type);
  }

  // Logins (person id = personnel id). Status is retired (Nov 2026).
  const logins = await tourLoginStates(
    supabase,
    { workspaceId: (tour as { workspace_id: string }).workspace_id, tourId, origin: new URL(_request.url).origin },
    personIds,
  );

  const list: PersonnelListItem[] = ((rows ?? []) as Array<{
    id: string;
    workspace_id: string;
    person_id: string;
    role: string;
    role_tag: PersonnelListItem['role_tag'] | null;
    rate_currency: string | null;
    rate_period: string | null;
    starts_on: string | null;
    ends_on: string | null;
  }>).map((r) => {
    const p = personById.get(r.person_id);
    return {
      id: r.id,
      person_id: r.person_id,
      workspace_id: r.workspace_id,
      display_name: p?.preferred_name?.trim() || p?.full_name?.trim() || 'Unknown',
      email: p?.email ?? null,
      phone: p?.phone ?? null,
      role: r.role,
      /* Sprint 12 §9c.0 — defaults to 'other' for safety
         in case a row predates migration 101 (shouldn't
         happen — DEFAULT 'other' on the column — but
         resilient). */
      role_tag: r.role_tag ?? 'other',
      employment: employmentByMember.get(r.id) ?? null,
      rate_currency: r.rate_currency,
      rate_period: r.rate_period,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      canonical_person_id: p?.canonical_person_id ?? null,
      login: logins[r.person_id] ?? { state: 'none', preset: null },
    };
  });

  return NextResponse.json({ personnel: list });
}

async function postHandler(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  // Runs this tour: admin / manager, or a Tour manager on one of theirs (298).
  const auth = await requireWrite(supabase, { runsTour: true, tourId: (await params).id });
  if ('error' in auth) return auth.error;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tourId } = await params;

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  // Changing the crew: whoever runs this tour (admin / manager / its Tour manager).
  if (!runsTour(await getViewerAccess(supabase, user.id, tourId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { person_id?: unknown; role?: unknown; role_tag?: unknown; starts_on?: unknown; ends_on?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const personId = typeof body.person_id === 'string' ? body.person_id : '';
  if (!personId) {
    return NextResponse.json({ error: 'person_id required' }, { status: 400 });
  }

  const { data: tour } = await supabase
    .from('tours')
    .select('workspace_id')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }

  // ONE writer for crew rows (src/server/people/addToTour.ts). Status is
  // retired (Nov 2026) — a `status` in the body is ignored.
  const r = await addPersonToTour(supabase, {
    tourId,
    workspaceId: (tour as { workspace_id: string }).workspace_id,
    personId,
    role: typeof body.role === 'string' ? body.role : null,
    roleTag: body.role_tag,
    startsOn: body.starts_on,
    endsOn: body.ends_on,
    actorUserId: user.id,
  });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  // Return the seeded rate card so Payroll/Rooming can append the new
  // member optimistically (no router.refresh).
  return NextResponse.json({ id: r.id, rateCard: r.rateCard });
}

// Money repair — roster and routing changes move salaries and per diems, so the
// budget's payroll lines are refreshed after a successful write.
export const POST = withDerivedRefresh(postHandler, 'payroll', tourFromParams);
