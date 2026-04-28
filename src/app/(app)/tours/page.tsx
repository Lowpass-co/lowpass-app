/* ============================================
   LOWPASS — Tours List Page

   Scrollable grid of all tours in workspace.
   ============================================ */

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseWorkspaceArtistId } from '@/lib/artist-scope';
import { ToursListWithFilters } from '@/components/tours/ToursListWithFilters';
import type { Tour } from '@/types';
import { listAppPageShell } from '@/components/shell/app-page-shells';

const TOURS_LIMIT = 200;

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ artist_id?: string }>;
}) {
  const { artist_id: artistIdParam } = await searchParams;
  const artistId = parseWorkspaceArtistId(artistIdParam);

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return listAppPageShell(
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
    return listAppPageShell(
      <div className="mx-auto max-w-6xl">
        <p className="text-lp-text-secondary">No workspace.</p>
      </div>
    );
  }

  let toursQuery = supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('workspace_id', profile.workspace_id)
    .order('start_date', { ascending: false })
    .limit(TOURS_LIMIT);
  if (artistId) toursQuery = toursQuery.eq('artist_id', artistId);
  const { data: tours, error } = await toursQuery;

  const total = tours?.length ?? 0;

  return listAppPageShell(
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-lp-text">{total}</span>
            <span className="text-lp-text-secondary">Tours</span>
          </div>
          <p className="mt-1 text-sm text-lp-text-secondary">
            {artistId
              ? 'Tours for the selected artist — routing and advance progress.'
              : 'All tours across all artists — routing and advance progress.'}
          </p>
        </div>
        <Link
          href="/tours/create"
          className="btn-transition btn-primary-press flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover"
        >
          <Plus size={16} />
          New Tour
        </Link>
      </div>

      {error ? (
        <div className="rounded-xl border border-lp-border bg-lp-surface p-6 text-lp-text-secondary">
          {error.message}
        </div>
      ) : !tours?.length ? (
        <div className="flex items-center justify-center rounded-xl border-2 border-dashed border-lp-border py-20">
          <div className="text-center">
            <p className="text-lp-text-secondary">No tours yet.</p>
            <p className="mt-1 text-sm text-lp-text-tertiary">
              Create your first tour to get started.
            </p>
            <Link
              href="/tours/create"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover"
            >
              <Plus size={16} />
              New Tour
            </Link>
          </div>
        </div>
      ) : (
        <ToursListWithFilters tours={(tours ?? []) as Tour[]} />
      )}
    </div>
  );
}
