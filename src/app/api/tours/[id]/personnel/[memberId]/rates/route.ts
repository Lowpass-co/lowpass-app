/* ============================================
   LOWPASS — GET /api/tours/[id]/personnel/[memberId]/rates (read-only since Oct 2026)
   (Payroll Sprint §P2)

   Reads + upserts the personnel_rates row for one tour
   assignment. Separate from the existing
   /personnel/[memberId] PATCH (which targets the retired
   tour_personnel daily-rate column). Payroll needs the
   show / off / per-diem / internal_rate quartet, read from
   the SSOT rate lines (rateAmountsFor) and written via
   writeRates. The GET/PUT wire keys are camelCase.

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
import { loadTourRateContext, rateAmountsFor } from '@/lib/payroll/loadRateLines';
import { CANONICAL_RATE_TYPE_IDS } from '@/lib/payroll/rateLines';

export const dynamic = 'force-dynamic';

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

  // A card names its person by person_id and/or roster_personnel_id (shared
  // UUIDs; cards made by a roster add carry only person_id — matching on
  // roster_personnel_id alone showed those people with £0 rates).
  const { data: cards } = await supabase
    .from('personnel_rates')
    .select('id, internal_rate')
    .eq('tour_id', tourId)
    .or(`person_id.eq.${r.personId},roster_personnel_id.eq.${r.personId}`)
    .limit(1);
  const card = ((cards ?? []) as Array<{ id: string; internal_rate: number | null }>)[0] ?? null;

  // Rates SSOT — the individual amounts come from personnel_rate_lines
  // (rateAmountsFor), never the legacy columns. internal_rate (admin-only, not a
  // rate type) stays on the card.
  const rateCtx = await loadTourRateContext(supabase, tourId, r.workspaceId);
  const a = card ? rateAmountsFor(rateCtx, card.id) : null;

  // Every non-zero line, named — the same figures Payroll → Summary shows.
  const lines = card
    ? (rateCtx.linesByRateId.get(card.id) ?? [])
        .filter((l) => CANONICAL_RATE_TYPE_IDS.includes(l.rate_type_id) && (Number(l.amount) || 0) !== 0)
        .map((l) => ({ name: rateCtx.types.find((t) => t.id === l.rate_type_id)?.name ?? 'Rate', amount: Number(l.amount) || 0 }))
    : [];

  return NextResponse.json({
    card_id: card?.id ?? null,
    lines,
    rates: {
      showRate: a?.showRate ?? 0,
      offRate: a?.offRate ?? 0,
      perDiem: a?.perDiem ?? 0,
      /* §P2 — only surface internal_rate to admins. */
      internal_rate: r.isAdmin ? (card?.internal_rate ?? null) : null,
    },
    is_admin: r.isAdmin,
  });
}

/* PUT removed (Oct 2026): rates are typed in ONE place — Payroll → Summary
   (/api/budget/rate-lines). This route is read-only, for the Crew panel. */
