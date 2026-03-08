/* ============================================
   LOWPASS — Artists List Page

   List workspace artists with Edit / Delete.
   ============================================ */

import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { ArtistsList } from '@/components/artists/ArtistsList';

export default async function ArtistsPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
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

  const { data: artists } = await supabase
    .from('artists')
    .select('*')
    .eq('workspace_id', profile.workspace_id)
    .order('name');

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Artists</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Artists in your workspace. Add or edit from tours.
          </p>
        </div>
      </div>

      <ArtistsList artists={artists ?? []} />
    </div>
  );
}
