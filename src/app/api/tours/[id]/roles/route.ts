/* ============================================
   LOWPASS — /api/tours/[id]/roles  (D1-3)

   Manage a tour's role assignments (tour_roles, mig 245). Admin/manager only —
   these grants decide which server-side slice each person sees on the Day and
   the tokenized links (D1-4).

     GET    → { roles, candidates }  (assignments + assignable roster persons)
     POST   { personId, role }       → assign / re-assign
     DELETE { roleId }               → remove
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { listTourRoles, assignTourRole, removeTourRole } from '@/lib/roles/server';
import { isTourRole } from '@/lib/roles/slices';

export const dynamic = 'force-dynamic';

async function guard(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, tourId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized', status: 401 as const };
  const membership = await getActiveMembership(supabase, user.id);
  if (!membership?.workspace_id) return { error: 'No workspace', status: 403 as const };
  if (membership.role !== 'admin' && membership.role !== 'manager') return { error: 'Not permitted', status: 403 as const };
  const { data: tour } = await supabase
    .from('tours').select('id').eq('id', tourId).eq('workspace_id', membership.workspace_id).maybeSingle();
  if (!tour) return { error: 'Tour not found', status: 404 as const };
  return { workspaceId: membership.workspace_id as string, userId: user.id };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const roles = await listTourRoles(supabase, tourId, g.workspaceId);
  // Assignable candidates = the tour roster's persons.
  const { data: roster } = await supabase
    .from('tour_personnel')
    .select('person_id, role, persons(full_name, preferred_name)')
    .eq('tour_id', tourId)
    .eq('workspace_id', g.workspaceId);
  const candidates = ((roster ?? []) as Array<Record<string, unknown>>).map((r) => {
    const p = (Array.isArray(r.persons) ? r.persons[0] : r.persons) as { full_name?: string | null; preferred_name?: string | null } | null;
    return { personId: r.person_id as string, name: (p?.preferred_name ?? p?.full_name ?? 'Unknown') as string, roster_role: (r.role as string | null) ?? null };
  });
  return NextResponse.json({ roles, candidates });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await request.json().catch(() => ({}))) as { personId?: string; role?: string };
  if (!body.personId) return NextResponse.json({ error: 'personId is required' }, { status: 400 });
  if (!isTourRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const { error } = await assignTourRole(supabase, {
    tourId, workspaceId: g.workspaceId, personId: body.personId, role: body.role, createdBy: g.userId,
  });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const g = await guard(supabase, tourId);
  if ('error' in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const body = (await request.json().catch(() => ({}))) as { roleId?: string };
  if (!body.roleId) return NextResponse.json({ error: 'roleId is required' }, { status: 400 });
  const { error } = await removeTourRole(supabase, { roleId: body.roleId, workspaceId: g.workspaceId });
  if (error) return NextResponse.json({ error }, { status: 500 });
  return NextResponse.json({ ok: true });
}
