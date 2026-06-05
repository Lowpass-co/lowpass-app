/* ============================================
   LOWPASS — Operations · Riders (Phase 4 unblock)

   /operations/[tourId]/riders — the live Rider Packs list for the tour.
   Ports the working /tours/[id]/rider-packs surface onto this URL,
   rendering the inner content only (ProductShell + TourHeader come from
   /operations/[tourId]/layout.tsx). Each card links to /rider-packs/[id]
   (the new builder/show shell).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RiderPacksTourClient } from '@/components/tours/RiderPacksTourClient';
import { riderPackRowsFromServer } from '@/components/tours/rider-pack-rows';

export const dynamic = 'force-dynamic';

export default async function OperationsTourRidersPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).single();
  if (!profile?.workspace_id) notFound();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name, workspace_id')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) notFound();

  const { data: packs } = await supabase
    .from('rider_packs')
    .select(
      `
      id,
      title,
      scope,
      artist_id,
      tour_id,
      updated_at,
      artists ( name ),
      rider_pack_exports ( exported_at, export_type )
    `,
    )
    .eq('tour_id', tour.id)
    .order('updated_at', { ascending: false });

  const { data: artists } = await supabase.from('artists').select('id, name').eq('workspace_id', profile.workspace_id);
  const artistMap = new Map((artists ?? []).map((a) => [a.id, a.name ?? 'Artist']));

  const rows = riderPackRowsFromServer(
    (packs ?? []) as unknown as Parameters<typeof riderPackRowsFromServer>[0],
    artistMap,
  );

  return (
    <div className="mx-auto w-full px-4 pt-6">
      <RiderPacksTourClient tourId={tour.id} tourName={tour.name ?? 'Tour'} rows={rows} />
    </div>
  );
}
