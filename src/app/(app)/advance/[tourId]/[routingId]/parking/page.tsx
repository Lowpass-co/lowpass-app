/* ============================================
   LOWPASS — Advance · one show · Parking (Nov 2026, Adam)

   /advance/[tourId]/[routingId]/parking — the show's parking map: an overhead
   satellite plan pinned to the venue, vehicles at true size, exported as a
   PDF for drivers. Opening it writes nothing. Admins/managers edit; read-only
   members see it.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getActiveMembership } from '@/lib/permissions/server';
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
  const [show, map, membership, { data: tour }] = await Promise.all([
    loadParkingShow(supabase, tourId, routingId),
    loadParkingMap(supabase, routingId),
    getActiveMembership(supabase, user.id),
    supabase.from('tours').select('name').eq('id', tourId).maybeSingle<{ name: string | null }>(),
  ]);
  if (!show || !membership || membership.workspace_id !== show.workspaceId) notFound();
  const canEdit = membership.role === 'admin' || membership.role === 'manager';
  return <ParkingEditor show={show} tourName={tour?.name ?? null} initial={map} canEdit={canEdit} />;
}
