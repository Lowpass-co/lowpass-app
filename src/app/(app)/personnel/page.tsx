/* ============================================
   LOWPASS — Workspace Personnel Roster

   LP-IDs, contact, default rates — not tied to an artist.
   ============================================ */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PersonnelRosterClient } from '@/components/personnel/PersonnelRosterClient';
import type { Personnel } from '@/types';

export default async function PersonnelPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">Please sign in.</p>
      </div>
    );
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return (
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  const { data: personnel } = await supabase
    .from('personnel')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('lp_id', { ascending: true });

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Personnel</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Workspace roster with LP-IDs. Assign people to each tour from Tour Management → Tour personnel.
        </p>
      </div>
      <PersonnelRosterClient initial={(personnel ?? []) as Personnel[]} />
    </div>
  );
}
