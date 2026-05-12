/* ============================================
   LOWPASS — /api/tours/[id]/personnel (Sprint 9 §6)

   GET  — list assigned personnel for the tour. Admin/manager
          full list; readonly without operations.personnel.read
          grant returns 403.
   POST — assign existing person to tour. Admin/manager OR
          readonly with operations.personnel.write grant.

   The Personnel page also calls /conflicts (POST) for
   cross-workspace conflict warnings — separate route.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { isRoleTag } from '@/lib/personnel/role-tags';
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
  employment_type: string | null;
  rate_amount: number | null;
  rate_currency: string | null;
  rate_period: string | null;
  starts_on: string | null;
  ends_on: string | null;
  status: Status;
  canonical_person_id: string | null;
  tags: string[];
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
  if (!canAccess(membership, grants, 'page', 'operations.personnel', 'read')) {
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
      'id, workspace_id, person_id, role, role_tag, employment_type, rate_amount, rate_currency, rate_period, starts_on, ends_on, status',
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

  const list: PersonnelListItem[] = ((rows ?? []) as Array<{
    id: string;
    workspace_id: string;
    person_id: string;
    role: string;
    role_tag: PersonnelListItem['role_tag'] | null;
    employment_type: string | null;
    rate_amount: number | null;
    rate_currency: string | null;
    rate_period: string | null;
    starts_on: string | null;
    ends_on: string | null;
    status: Status | null;
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
      employment_type: r.employment_type,
      rate_amount: r.rate_amount,
      rate_currency: r.rate_currency,
      rate_period: r.rate_period,
      starts_on: r.starts_on,
      ends_on: r.ends_on,
      status: (r.status ?? 'confirmed') as Status,
      canonical_person_id: p?.canonical_person_id ?? null,
      // tags: per-personnel-record tagging is a future sprint;
      // for now read 'crew', 'sound', 'lights', 'content' off
      // employment_type / role inference. v1: empty array.
      tags: [],
    };
  });

  return NextResponse.json({ personnel: list });
}

export async function POST(
  request: Request,
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
  if (!canAccess(membership, grants, 'page', 'operations.personnel', 'write')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: {
    person_id?: unknown;
    role?: unknown;
    /* Sprint 12 §9c.0 — structured role discriminator. Defaults
       to 'other' when omitted so existing API callers continue
       working. */
    role_tag?: unknown;
    employment_type?: unknown;
    rate_amount?: unknown;
    rate_currency?: unknown;
    rate_period?: unknown;
    starts_on?: unknown;
    ends_on?: unknown;
    status?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const personId = typeof body.person_id === 'string' ? body.person_id : '';
  if (!personId) {
    return NextResponse.json({ error: 'person_id required' }, { status: 400 });
  }
  const role = typeof body.role === 'string' && body.role.trim().length > 0
    ? body.role.trim()
    : 'Crew';

  /* Sprint 12 §9c.0 — role_tag validation. Falls back to
     'other' when the field is missing or doesn't match the
     CHECK-constrained enum. The DB constraint would catch a
     bad value, but surfacing here gives a 400 with a clear
     message instead of a 500. */
  const roleTagRaw = body.role_tag;
  const roleTag = isRoleTag(roleTagRaw) ? roleTagRaw : 'other';

  const status =
    typeof body.status === 'string' && VALID_STATUSES.has(body.status as Status)
      ? (body.status as Status)
      : 'confirmed';

  // Verify the person belongs to the same workspace as the tour.
  const { data: tour } = await supabase
    .from('tours')
    .select('workspace_id')
    .eq('id', tourId)
    .maybeSingle();
  if (!tour) {
    return NextResponse.json({ error: 'Tour not found' }, { status: 404 });
  }
  const tourWorkspaceId = (tour as { workspace_id: string }).workspace_id;

  const { data: person } = await supabase
    .from('persons')
    .select('id, workspace_id')
    .eq('id', personId)
    .maybeSingle();
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }
  if ((person as { workspace_id: string }).workspace_id !== tourWorkspaceId) {
    return NextResponse.json(
      { error: 'Person belongs to a different workspace' },
      { status: 400 },
    );
  }

  const insertRow = {
    workspace_id: tourWorkspaceId,
    tour_id: tourId,
    person_id: personId,
    role,
    role_tag: roleTag,
    employment_type: typeof body.employment_type === 'string' ? body.employment_type : null,
    rate_amount: typeof body.rate_amount === 'number' ? body.rate_amount : null,
    rate_currency: typeof body.rate_currency === 'string' ? body.rate_currency : 'GBP',
    rate_period: typeof body.rate_period === 'string' ? body.rate_period : null,
    starts_on: typeof body.starts_on === 'string' ? body.starts_on : null,
    ends_on: typeof body.ends_on === 'string' ? body.ends_on : null,
    status,
  };

  const { data: inserted, error } = await supabase
    .from('tour_personnel')
    .insert(insertRow)
    .select('id')
    .single();
  if (error) {
    // UNIQUE (tour_id, person_id, role) violation surfaces a
    // 23505 — return 409 so the UI can show "already assigned".
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await supabase.from('audit_log').insert({
    workspace_id: tourWorkspaceId,
    actor_user_id: user.id,
    action: 'created',
    entity_type: 'tour_personnel',
    entity_id: inserted.id,
    field_changes: {
      tour_id: tourId,
      person_id: personId,
      role,
      status,
    },
  });

  return NextResponse.json({ id: inserted.id });
}
