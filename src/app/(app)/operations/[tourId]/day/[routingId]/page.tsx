/* ============================================
   LOWPASS — Operations · The Day (D1-1)

   /operations/[tourId]/day/[routingId] — one routing row assembled into a
   single day surface (venue · schedule · hotel · flights · contacts · notes ·
   money chip). Read composition over data we already hold (loadDay); no new
   entry surfaces.

   SLICE ENFORCED SERVER-SIDE. The viewer's tour role decides which blocks
   loadDay even queries — so out-of-slice data (money, internal notes) is
   ABSENT from the rendered HTML, not CSS-hidden. Workspace admins/managers see
   the full `tm` slice; a readonly member sees their tour_roles slice (mig 245),
   fail-closed to `crew`.

   VIEW-AS (D1-5) is server-checked: ?viewAs=<role> re-renders through that role's
   slice via resolveEffectiveRole() — applied ONLY for admin/manager. loadDay then
   filters by the effective role, so "view as Crew" truly omits money + notes from
   the HTML (identical to the crew token view), never a client flag.

   ProductShell + the two-bar nav come from the operations layout.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { loadDay } from '@/lib/day/loadDay';
import { resolveViewerTourRole } from '@/lib/roles/server';
import { resolveEffectiveRole } from '@/lib/roles/slices';
import { DaySheet } from '@/components/day/DaySheet';
import { DaySheetActions } from '@/components/day/DaySheetActions';
import { ViewAsBar } from '@/components/day/ViewAsBar';

export const dynamic = 'force-dynamic';

interface DayPageProps {
  params: Promise<{ tourId: string; routingId: string }>;
  searchParams: Promise<{ viewAs?: string }>;
}

export default async function OperationsDayPage({ params, searchParams }: DayPageProps) {
  const { tourId, routingId } = await params;
  const { viewAs } = await searchParams;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const membership = await getActiveMembership(supabase, user.id);
  if (!membership?.workspace_id) notFound();
  const workspaceId = membership.workspace_id;

  // Resolve the viewer's tour role server-side (admin/manager=tm, readonly=their
  // tour_roles slice, fail-closed crew) — never a client flag.
  const realRole = await resolveViewerTourRole(supabase, membership.role, tourId, user.id);

  // View-as: only admin/manager may override; otherwise the param is ignored.
  const canViewAs = membership.role === 'admin' || membership.role === 'manager';
  const { role, viewingAs } = resolveEffectiveRole(realRole, viewAs, canViewAs);

  const day = await loadDay(supabase, { tourId, routingId, workspaceId, role });
  if (!day) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-12">
      <DaySheet day={day} actions={<DaySheetActions routingId={routingId} />} advanceHref={`/advance/${tourId}/${routingId}`} />
      {canViewAs ? <ViewAsBar viewingAs={viewingAs} /> : null}
    </div>
  );
}
