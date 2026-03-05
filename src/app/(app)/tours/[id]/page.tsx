/* ============================================
   LOWPASS — Tour Detail Page

   Tour header + routing editor (Grid/Calendar/Kanban).
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatDate } from '@/lib/utils';
import { RoutingEditor } from '@/components/routing/RoutingEditor';
import { TourDetailToasts } from './TourDetailToasts';
import { TourAdvanceSummary } from './TourAdvanceSummary';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

const statusColors: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  completed: 'bg-gray-500/10 text-gray-500',
  archived: 'bg-gray-500/10 text-gray-400',
};

export default async function TourDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ toast?: string }>;
}) {
  const { id } = await params;
  const { toast } = await searchParams;
  const supabase = await createServerSupabaseClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select(`
      *,
      artist:artists(*)
    `)
    .eq('id', id)
    .single();

  if (error || !tour) {
    notFound();
  }

  const { count: routingCount } = await supabase
    .from('routing')
    .select('*', { count: 'exact', head: true })
    .eq('tour_id', id);

  const artistName = tour.artist?.name ?? '—';
  const routingEmpty = (routingCount ?? 0) === 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/tours"
          className="flex items-center gap-1 text-sm text-lp-text-secondary hover:text-lp-text"
        >
          <ArrowLeft size={16} />
          Tours
        </Link>
      </div>

      <div className="rounded-xl border border-lp-border bg-lp-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-lp-text-tertiary">{artistName}</p>
            <h1 className="text-2xl font-bold text-lp-text">{tour.name}</h1>
            <p className="mt-1 text-sm text-lp-text-secondary">
              {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
            </p>
            <p className="mt-1 text-xs text-lp-text-tertiary">
              {tour.principal_count ?? 0} principals · {tour.band_count} band · {tour.crew_count} crew · {tour.continent} · {tour.currency}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                statusColors[tour.status] ?? statusColors.planning
              )}
            >
              {tour.status}
            </span>
            <Link
              href={`/tours/create?edit=${id}`}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover"
            >
              Edit tour
            </Link>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold text-lp-text">Routing</h2>
        <TourDetailToasts toast={toast} routingEmpty={routingEmpty}>
          <RoutingEditor
            tourId={tour.id}
            startDate={tour.start_date}
            endDate={tour.end_date}
            initialCustomDayTypes={(tour as { custom_day_types?: string[] }).custom_day_types ?? []}
          />
        </TourDetailToasts>
      </div>

      <TourAdvanceSummary tourId={tour.id} />
    </div>
  );
}
