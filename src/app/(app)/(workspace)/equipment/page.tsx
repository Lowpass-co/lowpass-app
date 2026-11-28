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
import type { EquipmentArtistOption, EquipmentTourOption, RentalInventoryItem, RentalJob, RentalJobItem } from '@/components/equipment/types';
import { loadRentalSettings, loadRentalStock } from '@/server/rental/stock';
import { LINE_COLS } from '@/server/rental/jobs';

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
  /* Every job's lines, so the list can show each job's total (one read). */
  const ids = jobs.map((j) => j.id);
  const [{ data: linesRaw }, settings] = await Promise.all([
    ids.length
      ? supabase.from('rental_job_items').select(LINE_COLS).in('job_id', ids)
      : Promise.resolve({ data: [] as RentalJobItem[] }),
    ws ? loadRentalSettings(supabase, ws) : Promise.resolve(null),
  ]);
  const artists = (artistsRaw ?? []) as EquipmentArtistOption[];
  const tours = (toursRaw ?? []) as EquipmentTourOption[];

  return (
    <EquipmentClient
      userId={user.id}
      workspaceId={ws}
      initialInventory={inventory ?? []}
      initialLines={(linesRaw ?? []) as unknown as RentalJobItem[]}
      settings={settings ?? { daysPerWeek: null, quoteValidDays: 14, paymentDetails: null }}
      initialJobs={jobs}
      initialArtists={artists}
      initialTours={tours}
    />
  );
}
