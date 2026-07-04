/* ============================================
   LOWPASS — GET/PUT /api/tours/[id]/personnel/[memberId]/rates
   (Payroll Sprint §P2)

   Reads + upserts the personnel_rates row for one tour
   assignment. Separate from the existing
   /personnel/[memberId] PATCH (which targets tour_personnel.
   rate_amount — a different, simpler single-rate field).
   Payroll needs the show / off / per_diem / internal_rate
   quartet from personnel_rates.

   personnel_rates keys legacy on (tour_id, person_name) with
   a roster_personnel_id FK to personnel(id) (migration 025 +
   050). We resolve the row by roster_personnel_id =
   tour_personnel.person_id; if no row exists we create one
   (the legacy person_name is filled from the assignment's
   display name so old SUMMARY-sheet joins still resolve).

   Admin gate: internal_rate ("Lowpass rate") is sensitive.
   GET only returns it when the caller is admin/manager; PUT
   only writes it for admin/manager. Non-admin writes that
   include internal_rate are silently dropped (not an error —
   keeps the auto-save flow simple).
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { writeRates } from '@/server/payroll/writeRates';

export const dynamic = 'force-dynamic';

interface RatesRow {
  id: string;
  show_rate: number;
  off_rate: number;
  per_diem: number;
  internal_rate: number | null;
}

function isAdminRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'manager';
}

/** Resolve the tour assignment + the caller's admin status. */
async function resolve(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  tourId: string,
  memberId: string,
): Promise<
  | { ok: true; workspaceId: string; personId: string; displayName: string; isAdmin: boolean }
  | { ok: false; response: NextResponse }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return { ok: false, response: NextResponse.json({ error: 'No workspace' }, { status: 403 }) };
  }

  const { data: assignment } = await supabase
    .from('tour_personnel')
    .select('id, tour_id, person_id, workspace_id, display_name')
    .eq('id', memberId)
    .maybeSingle<{
      id: string;
      tour_id: string;
      person_id: string;
      workspace_id: string;
      display_name: string | null;
    }>();
  if (!assignment || assignment.tour_id !== tourId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Assignment not found' }, { status: 404 }),
    };
  }
  if (assignment.workspace_id !== membership.workspace_id) {
    return { ok: false, response: NextResponse.json({ error: 'Wrong workspace' }, { status: 403 }) };
  }
  return {
    ok: true,
    workspaceId: membership.workspace_id,
    personId: assignment.person_id,
    displayName: assignment.display_name ?? '',
    isAdmin: isAdminRole(membership.role),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
): Promise<NextResponse> {
  const { id: tourId, memberId } = await params;
  const supabase = await createServerSupabaseClient();
  const r = await resolve(supabase, tourId, memberId);
  if (!r.ok) return r.response;

  const { data: rates } = await supabase
    .from('personnel_rates')
    .select('id, show_rate, off_rate, per_diem, internal_rate')
    .eq('tour_id', tourId)
    .eq('roster_personnel_id', r.personId)
    .maybeSingle<RatesRow>();

  return NextResponse.json({
    rates: rates
      ? {
          show_rate: rates.show_rate,
          off_rate: rates.off_rate,
          per_diem: rates.per_diem,
          /* §P2 — only surface internal_rate to admins. */
          internal_rate: r.isAdmin ? rates.internal_rate : null,
        }
      : { show_rate: 0, off_rate: 0, per_diem: 0, internal_rate: r.isAdmin ? null : null },
    is_admin: r.isAdmin,
  });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; memberId: string }> },
): Promise<NextResponse> {
  const { id: tourId, memberId } = await params;
  const supabase = await createServerSupabaseClient();
  const r = await resolve(supabase, tourId, memberId);
  if (!r.ok) return r.response;

  let body: {
    show_rate?: unknown;
    off_rate?: unknown;
    per_diem?: unknown;
    internal_rate?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const num = (v: unknown): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };

  const show = num(body.show_rate);
  const off = num(body.off_rate);
  const pd = num(body.per_diem);
  /* §P2 — internal_rate only writable by admin/manager. A non-admin sending it is
     dropped silently (no error) so the auto-save loop doesn't fail. */
  const internalRate =
    r.isAdmin && body.internal_rate !== undefined
      ? body.internal_rate === null
        ? null
        : num(body.internal_rate) ?? null
      : undefined;

  // Stage 1 — the ONE rate writer: keeps personnel_rate_lines (SSOT) + the legacy
  // mirror columns in lockstep, keyed by (tour_id, roster_personnel_id). Only the
  // provided rate keys are written (undefined = preserved).
  const result = await writeRates(supabase, {
    tourId,
    workspaceId: r.workspaceId,
    rosterPersonnelId: r.personId,
    identity: { person_name: r.displayName },
    rates: { show_rate: show, off_rate: off, per_diem: pd },
    internalRate,
  });
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json({ ok: true });
}
