/* ============================================
   LOWPASS — Production › Parking (Nov 2026, Adam)

   /operations/[tourId]/parking — every show day on the tour and its parking
   map. A map is per show; each one opens the editor at
   /operations/[tourId]/parking/[routingId]. The show's advance links here
   (it shows the map, it doesn't own it). Reads only.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { loadParkingIndex } from '@/server/parking/maps';
import { ParkingIndex } from '@/components/parking/ParkingIndex';

export const dynamic = 'force-dynamic';

export default async function ParkingIndexRoute({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const { data: tour } = await supabase.from('tours').select('id').eq('id', tourId).maybeSingle();
  if (!tour) notFound();
  const rows = await loadParkingIndex(supabase, tourId);
  return <ParkingIndex tourId={tourId} rows={rows} />;
}
