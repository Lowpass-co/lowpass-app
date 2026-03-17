/* ============================================
   LOWPASS — Tour Detail Page

   Tour header + routing editor (Grid/Calendar/Kanban).
   ============================================ */

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatTourDateRange, capitaliseStatus } from '@/lib/utils';
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

  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, date, day_type')
    .eq('tour_id', id);

  const routingCount = (routingRows ?? []).length;
  const showCount = (routingRows ?? []).filter((r) => r.day_type === 'show' || r.day_type === 'festival').length;

  const showRoutingIds = (routingRows ?? [])
    .filter((r) => r.day_type === 'show' || r.day_type === 'festival')
    .map((r) => r.id);

  const { data: completeAdvanceInstances } = showRoutingIds.length
    ? await supabase
        .from('advance_instances')
        .select('id, routing_id, status')
        .in('routing_id', showRoutingIds)
        .eq('status', 'complete')
    : { data: [] as unknown[] };

  const completeAdvanceCount = (completeAdvanceInstances ?? []).length;
  const advancePercent = showCount > 0 ? Math.round((completeAdvanceCount / showCount) * 100) : 0;

  const artistName = tour.artist?.name ?? '—';
  const routingEmpty = routingCount === 0;

  const today = new Date();
  const start = tour.start_date ? new Date(`${tour.start_date}T12:00:00`) : null;
  const end = tour.end_date ? new Date(`${tour.end_date}T12:00:00`) : null;
  const daysUntilStart =
    start && start.getTime() > today.getTime()
      ? Math.ceil((start.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
      : null;
  const inProgress =
    start && end
      ? today.getTime() >= start.getTime() && today.getTime() <= end.getTime()
      : false;

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

      <div className="rounded-xl border border-lp-border bg-lp-surface px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-lp-text-tertiary uppercase tracking-wider">Artist</span>
            <span className="font-semibold text-lp-text">{artistName}</span>
            <span className="text-lp-text-tertiary/60" aria-hidden>|</span>
            <span className="text-lp-text-tertiary uppercase tracking-wider">Tour</span>
            <span className="text-lp-text">{tour.name}</span>
            <span className="text-lp-text-tertiary/60" aria-hidden>|</span>
            <span className="text-lp-text-tertiary uppercase tracking-wider">Dates</span>
            <span className="text-lp-text">{formatTourDateRange(tour.start_date, tour.end_date)}</span>
            <span className="text-lp-text-tertiary/60" aria-hidden>|</span>
            <span className="text-xs text-lp-text-tertiary">
              {tour.principal_count ?? 0} principals · {tour.band_count} band · {tour.crew_count} crew · {tour.continent} · {tour.currency}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-3 py-1 text-xs font-medium',
                statusColors[tour.status] ?? statusColors.planning
              )}
            >
              {capitaliseStatus(tour.status)}
            </span>
            <Link
              href={`/tours/create?edit=${id}`}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover hover:border-lp-orange hover:text-lp-orange transition-colors"
            >
              Edit tour
            </Link>
          </div>
        </div>
      </div>

      <TourDetailToasts toast={toast} routingEmpty={routingEmpty}>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Total shows</p>
            <p className="mt-2 text-2xl tabular-nums font-bold text-lp-text">{showCount}</p>
          </div>
          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Total days</p>
            <p className="mt-2 text-2xl tabular-nums font-bold text-lp-text">{routingCount}</p>
          </div>
          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Advance completion</p>
            <p className="mt-2 text-2xl tabular-nums font-bold text-lp-text">{advancePercent}%</p>
            <p className="mt-1 text-xs text-lp-text-tertiary">{completeAdvanceCount} of {showCount} complete</p>
          </div>
          <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Starts in</p>
            <p className="mt-2 text-2xl tabular-nums font-bold text-lp-text">
              {inProgress ? 'In progress' : (daysUntilStart != null ? `${daysUntilStart}d` : '—')}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-lp-border bg-lp-surface/50 p-4">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-lp-text-tertiary">Quick links</p>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/tours/${id}`}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover hover:border-lp-orange hover:text-lp-orange transition-colors"
            >
              Routing
            </Link>
            <Link
              href={`/tours/${id}/advance`}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover hover:border-lp-orange hover:text-lp-orange transition-colors"
            >
              Advance
            </Link>
            <Link
              href={`/budget?tour_id=${id}`}
              className="rounded-lg border border-lp-border bg-lp-surface px-3 py-2 text-sm font-medium text-lp-text hover:bg-lp-surface-hover hover:border-lp-orange hover:text-lp-orange transition-colors"
            >
              Budget
            </Link>
          </div>
        </div>
      </TourDetailToasts>

      <TourAdvanceSummary tourId={tour.id} />
    </div>
  );
}
