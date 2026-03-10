/* ============================================
   LOWPASS — Dashboard Page

   TM overview: active tours, stats from Supabase,
   upcoming shows, and quick actions.
   ============================================ */

import {
  Map,
  ClipboardCheck,
  Calendar,
  Clock,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Tour } from '@/types';
import { DashboardTourCard } from '@/components/dashboard/DashboardTourCard';
import { DashboardAdvanceNeeds } from '@/components/dashboard/DashboardAdvanceNeeds';


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

  // Active tour ids for upcoming shows and shows-to-advance
  const { data: activeTours } = await supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active']);

  const activeTourIds = (activeTours ?? []).map((t) => t.id);

  // Shows to advance: routing dates in next 30 days — total show days and completed count for progress
  const in30Days = new Date();
  in30Days.setDate(in30Days.getDate() + 30);
  const in30DaysStr = in30Days.toISOString().slice(0, 10);
  const showDayTypes = ['show', 'festival'];
  let showsToAdvanceTotal = 0;
  let showsToAdvanceComplete = 0;
  if (activeTourIds.length > 0) {
    const { data: routingIn30 } = await supabase
      .from('routing')
      .select('id, day_type')
      .in('tour_id', activeTourIds)
      .gte('date', today)
      .lte('date', in30DaysStr);
    const routingRowsFiltered = (routingIn30 ?? []).filter((r: { day_type?: string }) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
      return showDayTypes.some((t) => types.includes(t));
    });
    const routingIds = routingRowsFiltered.map((r: { id: string }) => r.id);
    showsToAdvanceTotal = routingIds.length;
    if (routingIds.length > 0) {
      const { data: instances } = await supabase
        .from('advance_instances')
        .select('id, status')
        .in('routing_id', routingIds);
      showsToAdvanceComplete = (instances ?? []).filter((i: { status: string }) => i.status === 'complete').length;
    }
  }
  const showsToAdvanceCount = showsToAdvanceTotal - showsToAdvanceComplete;
  const advanceProgressPercent = showsToAdvanceTotal > 0 ? Math.round((showsToAdvanceComplete / showsToAdvanceTotal) * 100) : 0;

  // Shows this week (replacement for "Tours needing attention")
  let showsThisWeekCount = 0;
  if (activeTourIds.length > 0) {
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in7DaysStr = in7Days.toISOString().slice(0, 10);
    const { data: routingWeek } = await supabase
      .from('routing')
      .select('id, day_type')
      .in('tour_id', activeTourIds)
      .gte('date', today)
      .lte('date', in7DaysStr);
    showsThisWeekCount = (routingWeek ?? []).filter((r: { day_type?: string }) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
      return showDayTypes.some((t) => types.includes(t));
    }).length;
  }

  // Upcoming shows: routing where tour in active, day_type = show, date >= today, limit 5 (include id for advance link)
  let upcomingShows: { date: string; venue_name: string | null; city: string; tour_name: string; tour_id: string; routing_id: string }[] = [];
  if (activeTourIds.length > 0) {
    const { data: routingRows } = await supabase
      .from('routing')
      .select('id, date, venue_name, city, tour_id, day_type, tours(name)')
      .in('tour_id', activeTourIds)
      .gte('date', today)
      .order('date', { ascending: true })
      .limit(20);

    const showTypes = ['show', 'festival'];
    const rows = (routingRows ?? []).filter((r: { day_type?: string }) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
      return showTypes.some((t) => types.includes(t));
    }).slice(0, 5);
    upcomingShows = rows.map((r: { id: string; date: string; venue_name: string | null; city: string; tour_id: string; tours: { name: string } | { name: string }[] | null }) => {
      const tour = Array.isArray(r.tours) ? r.tours[0] : r.tours;
      return {
        date: r.date,
        venue_name: r.venue_name ?? null,
        city: r.city ?? '',
        tour_name: tour?.name ?? '—',
        tour_id: r.tour_id,
        routing_id: r.id,
      };
    });
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
  const nextShowDays = nextShow
    ? Math.ceil((new Date(nextShow.date).getTime() - new Date().setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000))
    : null;

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
          href={activeToursCount && activeToursCount > 0 ? '/tours' : undefined}
        />
        <StatCard
          icon={ClipboardCheck}
          label="Shows Advanced"
          value={showsToAdvanceTotal === 0 ? '—' : `${showsToAdvanceComplete} of ${showsToAdvanceTotal}`}
          detail={
            showsToAdvanceTotal === 0
              ? 'No shows in next 30 days'
              : `${advanceProgressPercent}% complete · ${showsToAdvanceCount} to go`
          }
          progress={showsToAdvanceTotal > 0 ? advanceProgressPercent : undefined}
          href={showsToAdvanceTotal > 0 ? '/advance' : undefined}
        />
        <StatCard
          icon={Calendar}
          label="Shows This Week"
          value={String(showsThisWeekCount)}
          detail={
            showsThisWeekCount === 0
              ? 'No show days in next 7 days'
              : 'Show days in next 7 days'
          }
          href={showsThisWeekCount > 0 ? '/advance' : undefined}
        />
        <StatCard
          icon={Clock}
          label="Next Show"
          value={
            nextShow
              ? (nextShowDays != null ? `${formatDate(nextShow.date)} (${nextShowDays} days)` : formatDate(nextShow.date))
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
          href={nextShow ? `/tours/${nextShow.tour_id}/advance` : undefined}
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
          <DashboardAdvanceNeeds />
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
                  href={`/tours/${show.tour_id}/advance/${show.routing_id}`}
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

          <Link
            href="/advance"
            className="block rounded-xl border border-lp-border bg-lp-surface p-4 transition-colors hover:bg-lp-surface-hover"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">
              Shows to Advance
            </p>
            <p className="mt-1 text-2xl font-bold text-lp-text">{showsToAdvanceCount}</p>
            <p className="mt-0.5 text-xs text-lp-text-tertiary">
              In next 30 days, not complete
            </p>
          </Link>
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
  href,
  progress,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  detail: string;
  accentColor?: string;
  empty?: boolean;
  emptyCta?: string;
  emptyHref?: string;
  href?: string;
  progress?: number;
}) {
  const content = (
    <>
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-lp-bg-tertiary shrink-0">
          <Icon size={20} className="text-lp-text-secondary" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-lp-text-tertiary">{label}</p>
          <p className={cn('text-xl font-bold truncate', accentColor || 'text-lp-text')}>{value}</p>
        </div>
      </div>
      {progress != null && (
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-lp-bg-tertiary">
          <div
            className="h-full rounded-full bg-lp-orange transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
      )}
      <p className="mt-3 text-xs text-lp-text-tertiary">{detail}</p>
      {empty && emptyCta && emptyHref && !href && (
        <Link
          href={emptyHref}
          className="mt-2 inline-block text-xs font-medium text-lp-orange hover:text-lp-orange-hover"
        >
          {emptyCta}
        </Link>
      )}
    </>
  );
  const className = 'rounded-xl border border-lp-border bg-lp-surface p-5 block transition-colors hover:bg-lp-surface-hover';
  const linkHref = href ?? (empty && emptyHref ? emptyHref : undefined);
  if (linkHref) {
    return (
      <Link href={linkHref} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}

