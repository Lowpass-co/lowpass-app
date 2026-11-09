/* ============================================
   LOWPASS — GET /api/persons/[id]/tours (Nov 2026, Adam)

   The tours a person is on, with their role and employment ON EACH TOUR —
   for the "On tours" list on their People panel. Read-only: role and
   employment are per tour and are changed on that tour's Crew or Payroll;
   the person's own "usual role" only fills in on a new tour.

   Workspace-scoped: tour_personnel / personnel_rates RLS, plus an explicit
   workspace filter.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { isEmployment, type Employment } from '@/lib/personnel/employment';
import type { PersonTourRow } from '@/lib/personnel/types';

export const dynamic = 'force-dynamic';

type TourRel = { name: string | null; start_date: string | null };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const { id: personId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(personId)) {
    return NextResponse.json({ error: 'Bad id' }, { status: 400 });
  }
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) return NextResponse.json({ error: 'No workspace' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('tour_personnel')
    .select('id, tour_id, role, status, tours(name, start_date)')
    .eq('person_id', personId)
    .eq('workspace_id', membership.workspace_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const members = (rows ?? []) as Array<{
    id: string;
    tour_id: string;
    role: string;
    status: string | null;
    tours: TourRel | TourRel[] | null;
  }>;
  const employment = new Map<string, Employment>();
  if (members.length > 0) {
    const { data: cards } = await supabase
      .from('personnel_rates')
      .select('tour_personnel_id, person_type')
      .in(
        'tour_personnel_id',
        members.map((m) => m.id),
      );
    for (const c of (cards ?? []) as Array<{ tour_personnel_id: string | null; person_type: string | null }>) {
      if (c.tour_personnel_id && isEmployment(c.person_type)) employment.set(c.tour_personnel_id, c.person_type);
    }
  }

  const tours: PersonTourRow[] = members
    .map((m) => {
      const t = Array.isArray(m.tours) ? m.tours[0] : m.tours;
      return {
        memberId: m.id,
        tourId: m.tour_id,
        tourName: t?.name?.trim() || 'Untitled tour',
        startDate: t?.start_date ?? null,
        role: m.role,
        employment: employment.get(m.id) ?? null,
        status: m.status ?? 'confirmed',
      };
    })
    // Newest tour first; undated last.
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

  return NextResponse.json({ tours });
}
