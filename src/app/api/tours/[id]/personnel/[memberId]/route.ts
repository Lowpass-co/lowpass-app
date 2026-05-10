/* ============================================
   LOWPASS — /api/tours/[id]/personnel/[memberId] (Sprint 9 §6)

   PATCH  — update role / employment_type / rate / window dates
            / status / notes for one tour_personnel row. Admin/
            manager OR readonly with operations.personnel.write.
            On status change, fire an audit_log row tagged for
            the Sprint 10 notification dispatcher to pick up.
   DELETE — remove the assignment row. Admin/manager OR
            readonly with operations.personnel.write.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  getActiveMembership,
  fetchActiveGrants,
  canAccess,
} from '@/lib/permissions/server';

export const dynamic = 'force-dynamic';

type Status =
  | 'confirmed'
  | 'tentative'
  | 'awaiting_contract'
  | 'cancelled'
  | 'fired';

const VALID_STATUSES: ReadonlySet<Status> = new Set([
  'confirmed',
  'tentative',
  'awaiting_contract',
  'cancelled',
  'fired',
]);

interface PatchPayload {
  role?: string;
  employment_type?: string | null;
  rate_amount?: number | null;
  rate_currency?: string | null;
  rate_period?: string | null;
  starts_on?: string | null;
  ends_on?: string | null;
  status?: Status;
}

export async function PATCH(
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // Validate the payload — coerce known fields, reject unknown
  // status values.
  const patch: PatchPayload = {};
  if (typeof body.role === 'string' && body.role.trim().length > 0) {
    patch.role = body.role.trim();
  }
  if (body.employment_type === null || typeof body.employment_type === 'string') {
    patch.employment_type = (body.employment_type as string | null) ?? null;
  }
  if (body.rate_amount === null || typeof body.rate_amount === 'number') {
    patch.rate_amount = body.rate_amount as number | null;
  }
  if (body.rate_currency === null || typeof body.rate_currency === 'string') {
    patch.rate_currency = body.rate_currency as string | null;
  }
  if (body.rate_period === null || typeof body.rate_period === 'string') {
    patch.rate_period = body.rate_period as string | null;
  }
  if (body.starts_on === null || typeof body.starts_on === 'string') {
    patch.starts_on = body.starts_on as string | null;
  }
  if (body.ends_on === null || typeof body.ends_on === 'string') {
    patch.ends_on = body.ends_on as string | null;
  }
  if (typeof body.status === 'string') {
    if (!VALID_STATUSES.has(body.status as Status)) {
      return NextResponse.json(
        { error: `Invalid status: ${body.status}` },
        { status: 400 },
      );
    }
    patch.status = body.status as Status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 });
  }

  // Snapshot existing row for audit + cross-field validation.
  const { data: existing } = await supabase
    .from('tour_personnel')
    .select(
      'id, workspace_id, tour_id, person_id, role, status, starts_on, ends_on',
    )
    .eq('id', memberId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }
  const ex = existing as {
    id: string;
    workspace_id: string;
    tour_id: string;
    person_id: string;
    role: string;
    status: Status;
    starts_on: string | null;
    ends_on: string | null;
  };
  if (ex.tour_id !== tourId) {
    return NextResponse.json(
      { error: 'Assignment does not belong to this tour' },
      { status: 400 },
    );
  }

  const { error: updErr } = await supabase
    .from('tour_personnel')
    .update(patch)
    .eq('id', memberId);
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Status-change audit row tagged for Sprint 10's notification
  // dispatcher. We resolve the personnel.user_id (if any) up
  // front so the dispatcher doesn't need a re-resolve query.
  //
  // Convention (per migration 078 comment block + Adam's Batch 1
  // review note): personnel.id == persons.id for matching rows
  // — they share UUIDs. There is NO personnel.person_id column.
  // Look up by id, scoped to the same workspace as the
  // assignment.
  if (patch.status && patch.status !== ex.status) {
    let wouldEmailUserId: string | null = null;
    const { data: linkedPersonnel } = await supabase
      .from('personnel')
      .select('id, user_id')
      .eq('id', ex.person_id)
      .eq('workspace_id', ex.workspace_id)
      .not('user_id', 'is', null)
      .limit(1)
      .maybeSingle();
    if (linkedPersonnel) {
      wouldEmailUserId = (linkedPersonnel as { user_id: string }).user_id;
    }

    await supabase.from('audit_log').insert({
      workspace_id: ex.workspace_id,
      actor_user_id: user.id,
      action: 'status_changed',
      entity_type: 'tour_personnel',
      entity_id: memberId,
      field_changes: {
        from: ex.status,
        to: patch.status,
        tour_id: ex.tour_id,
        person_id: ex.person_id,
        would_email_user_id: wouldEmailUserId,
      },
    });
  } else {
    // Generic update audit row.
    await supabase.from('audit_log').insert({
      workspace_id: ex.workspace_id,
      actor_user_id: user.id,
      action: 'updated',
      entity_type: 'tour_personnel',
      entity_id: memberId,
      field_changes: patch,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
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

  const { data: existing } = await supabase
    .from('tour_personnel')
    .select('id, workspace_id, tour_id, person_id, role, status')
    .eq('id', memberId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }
  const ex = existing as {
    id: string;
    workspace_id: string;
    tour_id: string;
    person_id: string;
    role: string;
    status: Status;
  };
  if (ex.tour_id !== tourId) {
    return NextResponse.json(
      { error: 'Assignment does not belong to this tour' },
      { status: 400 },
    );
  }

  const { error: delErr } = await supabase
    .from('tour_personnel')
    .delete()
    .eq('id', memberId);
  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  await supabase.from('audit_log').insert({
    workspace_id: ex.workspace_id,
    actor_user_id: user.id,
    action: 'deleted',
    entity_type: 'tour_personnel',
    entity_id: memberId,
    field_changes: {
      tour_id: ex.tour_id,
      person_id: ex.person_id,
      role: ex.role,
      previous_status: ex.status,
    },
  });

  return NextResponse.json({ ok: true });
}
