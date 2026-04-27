/* ============================================
   LOWPASS — Workspace Personnel Roster

   LP-IDs, contact, default rates — not tied to an artist.
   ============================================ */

import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { PersonLibraryClient } from '@/components/personnel/PersonLibraryClient';
import type { Person } from '@/lib/types/person';

export const dynamic = 'force-dynamic';

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

  const { data: persons } = await supabase
    .from('persons')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('full_name', { ascending: true });

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-lp-text">Personnel</h1>
        <p className="mt-1 text-sm text-lp-text-secondary">
          Workspace roster with LP-IDs. Assign people to each tour from Tour Management → Tour personnel.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="h-48 animate-pulse rounded-xl border border-lp-border bg-lp-surface/50" />
        }
      >
        <PersonLibraryClient initial={(persons ?? []) as Person[]} />
      </Suspense>
    </div>
  );
}
