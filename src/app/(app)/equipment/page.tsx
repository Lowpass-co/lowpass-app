/* ============================================
   LOWPASS — Equipment / Rental House
   Server component: fetches initial data,
   passes to client for all CRUD interaction.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { EquipmentClient } from '@/components/equipment/EquipmentClient';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Equipment — LOWPASS' };

export default async function EquipmentPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch initial data — RLS ensures only this user's rows come back
  const [{ data: inventory }, { data: jobs }] = await Promise.all([
    supabase
      .from('rental_inventory')
      .select('*')
      .order('name'),
    supabase
      .from('rental_jobs')
      .select('*')
      .order('start_date', { ascending: false }),
  ]);

  return (
    <EquipmentClient
      userId={user.id}
      initialInventory={inventory ?? []}
      initialJobs={jobs ?? []}
    />
  );
}
