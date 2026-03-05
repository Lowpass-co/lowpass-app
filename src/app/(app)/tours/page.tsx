/* ============================================
   LOWPASS — Tours List Page

   Kanban-style cards for all tours in workspace.
   Pagination via URL ?page=1&limit=20.
   ============================================ */

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourCard } from '@/components/tours/TourCard';
import { ToursPagination } from '@/components/tours/ToursPagination';

const DEFAULT_LIMIT = 20;

export default async function ToursPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params?.page ?? '1', 10) || 1);

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

  const from = (page - 1) * DEFAULT_LIMIT;
  const to = from + DEFAULT_LIMIT - 1;

  const { data: tours, error, count } = await supabase
    .from('tours')
    .select('*, artist:artists(*)', { count: 'exact' })
    .eq('workspace_id', profile.workspace_id)
    .order('start_date', { ascending: false })
    .range(from, to);

  const total = count ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Tours</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Manage your tours, routing, and advance progress.
          </p>
        </div>
        <Link
          href="/tours/create"
          className="flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover transition-colors"
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
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tours.map((tour) => (
              <TourCard key={tour.id} tour={tour} />
            ))}
          </div>
          <ToursPagination total={total} page={page} limit={DEFAULT_LIMIT} />
        </>
      )}
    </div>
  );
}
