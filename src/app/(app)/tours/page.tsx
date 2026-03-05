/* ============================================
   LOWPASS — Tours List Page

   Kanban-style cards for all tours in workspace.
   ============================================ */

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourCard } from '@/components/tours/TourCard';

export default async function ToursPage() {
  const supabase = await createServerSupabaseClient();
  const { data: tours } = await supabase
    .from('tours')
    .select(`
      *,
      artist:artists(*)
    `)
    .order('start_date', { ascending: false });

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

      {!tours?.length ? (
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tours.map((tour) => (
            <TourCard key={tour.id} tour={tour} />
          ))}
        </div>
      )}
    </div>
  );
}
