/* ============================================
   LOWPASS — POST /api/tours/[id]/personnel/[memberId]/swap
   (Personnel unification — Phase 4)

   Replace a roster member with another person, transferring everything
   that hangs off the roster row WITHOUT rebuilding:
     - the roster row's person_id is re-pointed to the replacement
     - their rate card (personnel_rates, linked by tour_personnel_id) →
       person_id + person_name updated
     - their room_assignments (linked by tour_personnel_id) → person_id
       updated
     - derived budget lines need NO change: they key on the rate card id
       (source_entity_id), which now belongs to the replacement, so the
       next reconcile re-labels them automatically.

   Same-role-already-on-roster collides with the UNIQUE(tour_id,
   person_id, role) → surfaced as 409. .maybeSingle() throughout.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: tourId, memberId } = await params;

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No active workspace' }, { status: 403 });
  }
  const grants = await fetchActiveGrants(supabase, membership, user.id);
  if (!canAccess(membership, grants, 'page', 'operations.personnel', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { new_person_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const newPersonId =
    typeof body.new_person_id === 'string' ? body.new_person_id : '';
  if (!newPersonId) {
    return NextResponse.json({ error: 'new_person_id required' }, { status: 400 });
  }

  // The roster row being swapped.
  const { data: member } = await supabase
    .from('tour_personnel')
    .select('id, workspace_id, tour_id, person_id, role')
    .eq('id', memberId)
    .maybeSingle();
  if (!member) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }
  const m = member as {
    id: string;
    workspace_id: string;
    tour_id: string;
    person_id: string;
    role: string;
  };
  if (m.tour_id !== tourId) {
    return NextResponse.json(
      { error: 'Assignment does not belong to this tour' },
      { status: 400 },
    );
  }
  if (m.person_id === newPersonId) {
    return NextResponse.json(
      { error: 'Replacement is the same person' },
      { status: 400 },
    );
  }

  // Replacement must be a person in the same workspace.
  const { data: newPerson } = await supabase
    .from('persons')
    .select('id, workspace_id, full_name')
    .eq('id', newPersonId)
    .maybeSingle();
  if (!newPerson || (newPerson as { workspace_id: string }).workspace_id !== m.workspace_id) {
    return NextResponse.json(
      { error: 'Replacement person not found in this workspace' },
      { status: 400 },
    );
  }
  const newName =
    (newPerson as { full_name?: string | null }).full_name?.trim() || m.role;

  // Already on this tour's roster? Swapping would duplicate them.
  const { data: clash } = await supabase
    .from('tour_personnel')
    .select('id')
    .eq('tour_id', tourId)
    .eq('person_id', newPersonId)
    .maybeSingle();
  if (clash) {
    return NextResponse.json(
      { error: 'That person is already on this tour. Remove them first or pick someone else.' },
      { status: 409 },
    );
  }

  // 1) Re-point the roster row.
  const { error: rosterErr } = await supabase
    .from('tour_personnel')
    .update({ person_id: newPersonId })
    .eq('id', memberId);
  if (rosterErr) {
    const status = rosterErr.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: rosterErr.message }, { status });
  }

  // 2) Transfer the rate card (linked by tour_personnel_id).
  await supabase
    .from('personnel_rates')
    .update({ person_id: newPersonId, person_name: newName })
    .eq('tour_personnel_id', memberId);

  // 3) Transfer room assignments (linked by tour_personnel_id).
  await supabase
    .from('room_assignments')
    .update({ person_id: newPersonId })
    .eq('tour_personnel_id', memberId);

  // 4) Derived budget lines need no change — they key on the rate card id,
  //    which now belongs to the replacement; the next reconcile re-labels.

  await supabase.from('audit_log').insert({
    workspace_id: m.workspace_id,
    actor_user_id: user.id,
    action: 'updated',
    entity_type: 'tour_personnel',
    entity_id: memberId,
    field_changes: {
      swapped_from_person_id: m.person_id,
      swapped_to_person_id: newPersonId,
      role: m.role,
    },
  });

  return NextResponse.json({ ok: true });
}
