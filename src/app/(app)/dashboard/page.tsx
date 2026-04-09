/* ============================================
   LOWPASS — Dashboard Page

   TM overview: active tours, stats from Supabase,
   upcoming shows, and quick actions.
   ============================================ */

import Link from 'next/link';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { Tour } from '@/types';
import { DashboardAdvanceNeeds } from '@/components/dashboard/DashboardAdvanceNeeds';
import { DashboardHighlights } from '@/components/dashboard/DashboardHighlights';
import { DashboardUpcoming } from '@/components/dashboard/DashboardUpcoming';
import { DashboardTourList } from '@/components/dashboard/DashboardTourList';
import { DashboardArtistGate } from '@/components/dashboard/DashboardArtistGate';
import { parseWorkspaceArtistId } from '@/lib/artist-scope';

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ artist_id?: string }>;
}) {
  const { artist_id: artistIdParam } = await searchParams;
  const artistId = parseWorkspaceArtistId(artistIdParam);

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

  // Total tours (for welcome state)
  let totalToursQ = supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id);
  if (artistId) totalToursQ = totalToursQ.eq('artist_id', artistId);
  const { count: totalToursCount } = await totalToursQ;

  // Total active tours (planning + active)
  let activeToursCountQ = supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active']);
  if (artistId) activeToursCountQ = activeToursCountQ.eq('artist_id', artistId);
  const { count: activeToursCount } = await activeToursCountQ;

  // Artists count: workspace, or 1 when a single artist is scoped
  let artistsCount: number | null;
  if (artistId) {
    const { count: oneArtist } = await supabase
      .from('artists')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', profile.workspace_id)
      .eq('id', artistId);
    artistsCount = oneArtist ?? 0;
  } else {
    const { count: ac } = await supabase
      .from('artists')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', profile.workspace_id);
    artistsCount = ac;
  }

  // Shows this year: routing rows in current year with day_type show/festival, for workspace tours
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const yearEnd = `${new Date().getFullYear()}-12-31`;
  let workspaceTourIdsQ = supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id);
  if (artistId) workspaceTourIdsQ = workspaceTourIdsQ.eq('artist_id', artistId);
  const { data: workspaceTourIds } = await workspaceTourIdsQ;
  const allTourIds = (workspaceTourIds ?? []).map((t: { id: string }) => t.id);
  let showsThisYearCount = 0;
  if (allTourIds.length > 0) {
    const { data: routingYear } = await supabase
      .from('routing')
      .select('id, day_type')
      .in('tour_id', allTourIds)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    const showDayTypes = ['show', 'festival'];
    showsThisYearCount = (routingYear ?? []).filter((r: { day_type?: string }) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
      return showDayTypes.some((t) => types.includes(t));
    }).length;
  }

  // Completed tours count
  let completedQ = supabase
    .from('tours')
    .select('*', { count: 'exact', head: true })
    .eq('workspace_id', profile.workspace_id)
    .eq('status', 'completed');
  if (artistId) completedQ = completedQ.eq('artist_id', artistId);
  const { count: completedToursCount } = await completedQ;

  // Active tour ids for upcoming shows and shows-to-advance
  let activeToursQ = supabase
    .from('tours')
    .select('id')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active']);
  if (artistId) activeToursQ = activeToursQ.eq('artist_id', artistId);
  const { data: activeTours } = await activeToursQ;

  const activeTourIds = (activeTours ?? []).map((t) => t.id);

  // Total routing days (all workspace tours)
  let totalRoutingDays = 0;
  if (allTourIds.length > 0) {
    const { count: routingCount } = await supabase
      .from('routing')
      .select('*', { count: 'exact', head: true })
      .in('tour_id', allTourIds);
    totalRoutingDays = routingCount ?? 0;
  }

  // Touring days this year (show/festival/rehearsal in current year)
  let touringDaysThisYear = 0;
  if (allTourIds.length > 0) {
    const { data: routingYearTouring } = await supabase
      .from('routing')
      .select('id, day_type')
      .in('tour_id', allTourIds)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    const touringTypes = ['show', 'festival', 'rehearsal'];
    touringDaysThisYear = (routingYearTouring ?? []).filter((r: { day_type?: string }) => {
      const types = (r.day_type ?? '').split(',').map((s: string) => s.trim());
      return touringTypes.some((t) => types.includes(t));
    }).length;
  }

  // Upcoming: next 7 days, all day types (no filter by show/festival/rehearsal)
  const in7Days = new Date();
  in7Days.setDate(in7Days.getDate() + 7);
  const in7DaysStr = in7Days.toISOString().slice(0, 10);
  let upcoming7Days: { date: string; venue_name: string | null; city: string; tour_name: string; tour_id: string; routing_id: string }[] = [];
  let daysUntilNextShow: number | null = null;
  if (activeTourIds.length > 0) {
    const { data: routingRows } = await supabase
      .from('routing')
      .select('id, date, venue_name, city, tour_id, tours(name)')
      .in('tour_id', activeTourIds)
      .gte('date', today)
      .lte('date', in7DaysStr)
      .order('date', { ascending: true });

    const rows = routingRows ?? [];
    upcoming7Days = rows.map((r: { id: string; date: string; venue_name: string | null; city: string; tour_id: string; tours: { name: string } | { name: string }[] | null }) => {
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
    if (upcoming7Days.length > 0 && upcoming7Days[0].date >= today) {
      const first = new Date(upcoming7Days[0].date);
      const todayDate = new Date(today);
      daysUntilNextShow = Math.max(0, Math.ceil((first.getTime() - todayDate.getTime()) / (24 * 60 * 60 * 1000)));
    }
  }

  // List of active tours for the left column (with artist)
  let toursListQ = supabase
    .from('tours')
    .select('*, artist:artists(*)')
    .eq('workspace_id', profile.workspace_id)
    .in('status', ['planning', 'active'])
    .order('start_date', { ascending: false })
    .limit(10);
  if (artistId) toursListQ = toursListQ.eq('artist_id', artistId);
  const { data: toursList } = await toursListQ;

  return (
    <DashboardArtistGate>
      <div className="lp-dashboard-glass mx-auto min-h-[60vh] max-w-7xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-lp-text">Dashboard</h1>
            <p className="mt-1 text-sm text-lp-text-secondary">
              {artistId
                ? 'Overview of active tours and advance progress for the selected artist.'
                : 'Overview of your active tours and advance progress.'}
            </p>
          </div>
        </div>

        {totalToursCount === 0 && (
          <div className="lp-dashboard-glass-card rounded-2xl p-8 text-center">
            <h2 className="text-xl font-semibold text-lp-text">Welcome to Lowpass!</h2>
            <p className="mt-2 text-lp-text-secondary">
              Create your first tour to get started.
            </p>
            <Link
              href="/tours/create"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-lp-orange px-5 py-2.5 text-sm font-medium text-white hover:bg-lp-orange-hover transition-colors"
            >
              +
              Create your first tour
            </Link>
          </div>
        )}

        {/* Three-column layout: highlights | tour list | upcoming + needs attention */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: highlight cards */}
          <div className="lg:col-span-3">
            <DashboardHighlights
              activeToursCount={activeToursCount ?? 0}
              showsThisYearCount={showsThisYearCount}
              artistsCount={artistsCount ?? 0}
              completedToursCount={completedToursCount ?? 0}
              daysUntilNextShow={daysUntilNextShow}
              totalRoutingDays={totalRoutingDays}
              touringDaysThisYear={touringDaysThisYear}
            />
          </div>

          {/* Middle: tour list with sort/filter */}
          <div className="lg:col-span-5">
            <DashboardTourList tours={(toursList ?? []) as Tour[]} />
          </div>

          {/* Right: upcoming (7 days) + needs attention */}
          <div className="lg:col-span-4 flex flex-col gap-4">
            <DashboardUpcoming items={upcoming7Days} />
            <DashboardAdvanceNeeds />
          </div>
        </div>
      </div>
    </DashboardArtistGate>
  );
}


