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
import { isTourRole, type TourRole } from '@/lib/roles/slices';
import { DaySheet } from '@/components/day/DaySheet';

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

  // Resolve the viewer's tour role. Admin/manager = full operator (tm). A
  // readonly member is scoped to their tour_roles slice; no row → fail-closed crew.
  let role: TourRole = 'tm';
  if (membership.role === 'readonly') {
    const { data: tr } = await supabase
      .from('tour_roles')
      .select('role')
      .eq('tour_id', tourId)
      .eq('user_id', user.id)
      .maybeSingle();
    role = isTourRole(tr?.role) ? tr.role : 'crew';
  }

  const day = await loadDay(supabase, { tourId, routingId, workspaceId, role });
  if (!day) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 pb-12">
      <DaySheet day={day} />
    </div>
  );
}
