/* ============================================
   LOWPASS — Production › Parking · one show (Nov 2026, Adam)

   /operations/[tourId]/parking/[routingId] — the show's parking map: an overhead
   satellite plan pinned to the venue, vehicles at true size, exported as a
   PDF for drivers; the show's advance links here. Opening it writes nothing.
   Who edits is the DATABASE's answer (tour access): admins / managers, and a
   Member with Parking EDIT on this tour — the same rule the API applies
   (requireWrite area 'parking'). It used to check the role only, so a Member
   given Parking edit got a read-only map (Nov 2026, Ben on Aura).
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
import { getViewerAccess, viewerAllows } from '@/lib/permissions/tourAccess';
import { loadParkingMap, loadParkingShow } from '@/server/parking/maps';
import { ParkingEditor } from '@/components/parking/ParkingEditor';

export const dynamic = 'force-dynamic';

export default async function ParkingRoute({ params }: { params: Promise<{ tourId: string; routingId: string }> }) {
  const { tourId, routingId } = await params;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();
  const [show, map, membership, access, { data: tour }] = await Promise.all([
    loadParkingShow(supabase, tourId, routingId),
    loadParkingMap(supabase, routingId),
    getActiveMembership(supabase, user.id),
    getViewerAccess(supabase, user.id, tourId),
    supabase.from('tours').select('name').eq('id', tourId).maybeSingle<{ name: string | null }>(),
  ]);
  if (!show || !membership || membership.workspace_id !== show.workspaceId) notFound();
  const canEdit = viewerAllows(access, 'parking', 'edit');
  return <ParkingEditor show={show} tourName={tour?.name ?? null} initial={map} canEdit={canEdit} />;
}
