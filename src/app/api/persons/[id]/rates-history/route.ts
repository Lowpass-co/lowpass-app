/* ============================================
   LOWPASS — GET /api/persons/[id]/rates-history
   (Payroll Sprint §P2)

   Returns this person's rates from their OTHER tours, newest
   first, for the "Copy from previous tour" affordance in the
   rates section. Each entry carries the tour name + the rate
   quartet so the UI can show "Spring Tour '25 — £200 / £100 /
   £50" and pull those values into the current tour's row.

   internal_rate is admin-gated: only included for admin/
   manager callers. Non-admins get null in that field.

   Scoped to the caller's workspace via getActiveMembership.
   The optional ?exclude=<tourId> drops the current tour so it
   doesn't show up in its own copy list.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { loadMultiTourRateContext, rateAmountsFor } from '@/lib/payroll/loadRateLines';

export const dynamic = 'force-dynamic';

interface HistoryRow {
  id: string;
  tour_id: string;
  internal_rate: number | null;
  updated_at: string;
  tours: { name: string | null } | { name: string | null }[] | null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id: personId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }
  const isAdmin = membership.role === 'admin' || membership.role === 'manager';

  const url = new URL(request.url);
  const excludeTour = url.searchParams.get('exclude');

  const { data } = await supabase
    .from('personnel_rates')
    .select('id, tour_id, internal_rate, updated_at, tours(name)')
    .eq('roster_personnel_id', personId)
    .eq('workspace_id', membership.workspace_id)
    .order('updated_at', { ascending: false })
    .limit(20);

  const rows = ((data ?? []) as HistoryRow[]).filter((row) => row.tour_id !== excludeTour);

  // Rates SSOT — the historical amounts come from personnel_rate_lines
  // (rateAmountsFor) across every tour in the list, never the legacy columns.
  const tourIds = Array.from(new Set(rows.map((r) => r.tour_id)));
  const rateCtx = tourIds.length
    ? await loadMultiTourRateContext(supabase, tourIds, membership.workspace_id)
    : null;

  const history = rows.map((row) => {
    const tour = Array.isArray(row.tours) ? row.tours[0] : row.tours;
    const a = rateCtx ? rateAmountsFor(rateCtx, row.id) : null;
    return {
      tour_id: row.tour_id,
      tour_name: tour?.name ?? 'Untitled tour',
      showRate: a?.showRate ?? 0,
      offRate: a?.offRate ?? 0,
      perDiem: a?.perDiem ?? 0,
      internal_rate: isAdmin ? row.internal_rate : null,
      updated_at: row.updated_at,
    };
  });

  return NextResponse.json({ history, is_admin: isAdmin });
}
