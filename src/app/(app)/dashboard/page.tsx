/* ============================================
   LOWPASS — Dashboard Page

   TM overview: active tours, stats from Supabase,
   upcoming shows, and quick actions.
   ============================================ */

import {
  Map,
  ClipboardCheck,
  AlertTriangle,
  Clock,
  ArrowRight,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Tour } from '@/types';


export default async function DashboardPage() {
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

  const today = new Date().toISOString().slice(0, 10);
  const in14Days = new Date();
  in14Days.setDate(in14Days.getDate() + 14);
  const in14DaysStr = in14Days.toISOString().slice(0, 10);

  // Total tours (for welcome state)
  const { count: totalToursCount } = await supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id);

  // Total active tours (planning + active)
  const { count: activeToursCount } = await supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active']);

  // Tours needing attention: start_date within 14 days, status = planning
  const { data: needingAttention } = await supabase
    .from('tours')
    .select('id, name, start_date')
    .eq('workspace_id', profile.workspace_id)
    .eq('status', 'planning')
    .gte('start_date', today)
    .lte('start_date', in14DaysStr)
    .order('start_date', { ascending: true })
    .limit(10);

  // Total artists
  const { count: artistsCount } = await supabase
    .from('artists')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id);

  // Active tour ids for upcoming shows
  const { data: activeTours } = await supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active']);

  const activeTourIds = (activeTours ?? []).map((t) => t.id);

  // Upcoming shows: routing where tour in active, day_type = show, date >= today, limit 5
  let upcomingShows: { date: string; venue_name: string | null; city: string; tour_name: string; tour_id: string }[] = [];
  if (activeTourIds.length > 0) {
    const { data: routingRows } = await supabase
      .from('routing')
      .select('date, venue_name, city, tour_id, tours(name)')
      .in('tour_id', activeTourIds)
      .eq('day_type', 'show')
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(5);

    upcomingShows = (routingRows ?? []).map((r: { date: string; venue_name: string | null; city: string; tour_id: string; tours: { name: string } | null }) => ({
      date: r.date,
      venue_name: r.venue_name ?? null,
      city: r.city ?? '',
      tour_name: (r.tours as { name: string } | null)?.name ?? '—',
      tour_id: r.tour_id,
    }));
  }

  // List of active tours for the left column (with artist)
  const { data: toursList } = await supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active'])
    .order('start_date', { ascending: false })
    .limit(10);

  const planningCount =
    (toursList ?? []).filter((t) => t.status === 'planning').length;
  const activeCount =
    (toursList ?? []).filter((t) => t.status === 'active').length;
  const nextShow = upcomingShows[0];

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-lp-text">Dashboard</h1>
          <p className="mt-1 text-sm text-lp-text-secondary">
            Overview of your active tours and advance progress.
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

      {totalToursCount === 0 && (
        <div className="rounded-xl border-2 border-lp-border bg-lp-surface p-8 text-center">
          <h2 className="text-xl font-semibold text-lp-text">Welcome to Lowpass!</h2>
          <p className="mt-2 text-lp-text-secondary">
            Create your first tour to get started.
          </p>
          <Link
            href="/tours/create"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover transition-colors"
          >
            <Plus size={18} />
            Create your first tour
          </Link>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Map}
          label="Active Tours"
          value={String(activeToursCount ?? 0)}
          detail={
            activeToursCount === 0
              ? 'No active tours'
              : `${planningCount} planning, ${activeCount} active`
          }
          empty={activeToursCount === 0}
          emptyCta="Create your first tour"
          emptyHref="/tours/create"
        />
        <StatCard
          icon={ClipboardCheck}
          label="Shows Advanced"
          value="—"
          detail="Coming soon"
          accentColor="text-lp-text-tertiary"
        />
        <StatCard
          icon={AlertTriangle}
          label="Tours Needing Attention"
          value={String(needingAttention?.length ?? 0)}
          detail={
            (needingAttention?.length ?? 0) === 0
              ? 'None'
              : 'Start within 14 days, still planning'
          }
          accentColor={(needingAttention?.length ?? 0) > 0 ? 'text-amber-500' : undefined}
        />
        <StatCard
          icon={Clock}
          label="Next Show"
          value={
            nextShow
              ? formatDate(nextShow.date)
              : '—'
          }
          detail={
            nextShow
              ? `${nextShow.venue_name || nextShow.city || 'TBC'} · ${nextShow.tour_name}`
              : 'No upcoming shows'
          }
          empty={!nextShow}
          emptyCta="View tours"
          emptyHref="/tours"
        />
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-base font-semibold text-lp-text">Active Tours</h2>
          {!toursList?.length ? (
            <div className="rounded-xl border-2 border-dashed border-lp-border bg-lp-surface p-8 text-center">
              <p className="text-lp-text-secondary">No active tours yet.</p>
              <Link
                href="/tours/create"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-4 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover"
              >
                <Plus size={16} />
                Create your first tour
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {toursList.map((tour) => (
                <DashboardTourCard key={tour.id} tour={tour as Tour} />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-base font-semibold text-lp-text">Upcoming Shows</h2>
          {upcomingShows.length === 0 ? (
            <div className="rounded-xl border border-lp-border bg-lp-surface p-6 text-center">
              <p className="text-sm text-lp-text-tertiary">No upcoming shows.</p>
              <Link
                href="/tours"
                className="mt-2 inline-block text-sm font-medium text-lp-orange hover:text-lp-orange-hover"
              >
                View tours
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingShows.map((show) => (
                <Link
                  key={`${show.tour_id}-${show.date}`}
                  href={`/tours/${show.tour_id}`}
                  className="block rounded-lg border border-lp-border bg-lp-surface p-3 transition-colors hover:bg-lp-surface-hover"
                >
                  <p className="font-medium text-lp-text">
                    {formatDate(show.date)} · {show.venue_name || show.city || 'TBC'}
                  </p>
                  <p className="mt-0.5 text-xs text-lp-text-tertiary">{show.city} · {show.tour_name}</p>
                </Link>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-lp-border bg-lp-surface p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Total Artists
            </p>
            <p className="mt-1 text-xl font-bold text-lp-text">{artistsCount ?? 0}</p>
            {artistsCount === 0 && (
              <Link
                href="/tours/create"
                className="mt-2 inline-block text-xs font-medium text-lp-orange hover:text-lp-orange-hover"
              >
                Add artists via a tour
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Sub-components ----

function StatCard({
  icon: Icon,
  label,
  value,
  detail,
  accentColor,
  empty,
  emptyCta,
  emptyHref,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  accentColor?: string;
  empty?: boolean;
  emptyCta?: string;
  emptyHref?: string;
}) {
  return (
    <div className="rounded-xl border border-lp-border bg-lp-surface p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lp-bg-tertiary">
          <Icon size={20} className="text-lp-text-secondary" />
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">{label}</p>
          <p className={cn('text-xl font-bold', accentColor || 'text-lp-text')}>{value}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-lp-text-tertiary">{detail}</p>
      {empty && emptyCta && emptyHref && (
        <Link
          href={emptyHref}
          className="mt-2 inline-block text-xs font-medium text-lp-orange hover:text-lp-orange-hover"
        >
          {emptyCta}
        </Link>
      )}
    </div>
  );
}

function DashboardTourCard({ tour }: { tour: Tour }) {
  const statusColors: Record<string, string> = {
    planning: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    active: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    completed: 'bg-gray-500/10 text-gray-500',
    archived: 'bg-gray-500/10 text-gray-400',
  };
  const artistName = tour.artist?.name ?? '—';

  return (
    <Link
      href={`/tours/${tour.id}`}
      className="group flex items-center justify-between rounded-xl border border-lp-border bg-lp-surface p-5 hover:border-lp-orange/30 hover:bg-lp-surface-hover transition-all"
    >
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-lp-text">{artistName}</h3>
          <span
            className={cn(
              'rounded-full px-2.5 py-0.5 text-xs font-medium',
              statusColors[tour.status] ?? statusColors.planning
            )}
          >
            {tour.status}
          </span>
        </div>
        <p className="text-sm text-lp-text-secondary">{tour.name}</p>
        <div className="flex items-center gap-4 text-xs text-lp-text-tertiary">
          <span>
            {formatDate(tour.start_date)} – {formatDate(tour.end_date)}
          </span>
        </div>
      </div>
      <ArrowRight size={16} className="text-lp-text-tertiary group-hover:text-lp-orange transition-colors" />
    </Link>
  );
}
