/* ============================================
   LOWPASS — Equipment / Rental House
   Server component: fetches initial data,
   passes to client for all CRUD interaction.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
/* IA Cleanup §I3 — shell-v1 PageShell wrapper retired here;
   the (workspace) layout provides chrome (WorkspaceTopBar +
   WorkspaceTabs) for /artists, /personnel, /equipment. */
import { EquipmentClient } from '@/components/equipment/EquipmentClient';
import { redirect } from 'next/navigation';
import type { EquipmentArtistOption, EquipmentTourOption, RentalInventoryItem, RentalJob } from '@/components/equipment/types';
import { loadDaysPerWeek, loadRentalStock } from '@/server/rental/stock';

export const metadata = { title: 'Equipment — LOWPASS' };

export default async function EquipmentPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  const ws = profile?.workspace_id ?? null;

  const [{ data: inventory }, { data: jobsRaw }, { data: artistsRaw }, { data: toursRaw }] = await Promise.all([
    // ONE stock list (Nov 2026): the Gear & rentals page's `gear`, not the
    // retired rental_inventory (server/rental/stock.ts).
    ws ? loadRentalStock(supabase, ws).then((data) => ({ data })) : Promise.resolve({ data: [] as RentalInventoryItem[] }),
    supabase
      .from('rental_jobs')
      .select(`
        *,
        artist:artists ( id, name ),
        tour:tours ( id, name )
      `)
      .order('start_date', { ascending: false }),
    ws
      ? supabase.from('artists').select('id, name').eq('workspace_id', ws).order('name')
      : Promise.resolve({ data: [] as EquipmentArtistOption[] }),
    ws
      ? supabase.from('tours').select('id, name, artist_id').eq('workspace_id', ws).order('start_date', { ascending: false })
      : Promise.resolve({ data: [] as EquipmentTourOption[] }),
  ]);

  const jobs = (jobsRaw ?? []).map((row) => {
    const j = row as RentalJob;
    return {
      ...j,
      artist_id: j.artist_id ?? null,
      tour_id: j.tour_id ?? null,
    };
  });
  const artists = (artistsRaw ?? []) as EquipmentArtistOption[];
  const tours = (toursRaw ?? []) as EquipmentTourOption[];

  return (
    <EquipmentClient
      userId={user.id}
      workspaceId={ws}
      initialInventory={inventory ?? []}
      daysPerWeekDefault={ws ? await loadDaysPerWeek(supabase, ws) : null}
      initialJobs={jobs}
      initialArtists={artists}
      initialTours={tours}
    />
  );
}
