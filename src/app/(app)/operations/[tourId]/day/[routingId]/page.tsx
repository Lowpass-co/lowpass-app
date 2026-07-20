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
   fail-closed to `crew`. View-as (?viewAs=) lands in D1-5.

   ProductShell + the two-bar nav come from the operations layout.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { loadDay } from '@/lib/day/loadDay';
import { resolveViewerTourRole } from '@/lib/roles/server';
import { DaySheet } from '@/components/day/DaySheet';
import { DaySheetActions } from '@/components/day/DaySheetActions';

export const dynamic = 'force-dynamic';

interface DayPageProps {
  params: Promise<{ tourId: string; routingId: string }>;
}

export default async function OperationsDayPage({ params }: DayPageProps) {
  const { tourId, routingId } = await params;
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
  const role = await resolveViewerTourRole(supabase, membership.role, tourId, user.id);

  const day = await loadDay(supabase, { tourId, routingId, workspaceId, role });
  if (!day) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-12">
      <DaySheet day={day} actions={<DaySheetActions routingId={routingId} />} />
    </div>
  );
}
