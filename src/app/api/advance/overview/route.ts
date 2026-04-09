/* ============================================
   LOWPASS — Advance Overview API

   GET: Cross-tour advance summary for the workspace
   (tours with progress, needs attention, upcoming)
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseWorkspaceArtistId } from '@/lib/artist-scope';

const SHOW_DAY_TYPES = ['show', 'festival'];

type FlagItem = { id: string; resolved: boolean; type: string };

export async function GET(request: Request) {
  const artistId = parseWorkspaceArtistId(new URL(request.url).searchParams.get('artist_id'));

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('workspace_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workspace_id) {
    return NextResponse.json({ error: 'No workspace' }, { status: 403 });
  }

  let toursQuery = supabase
    .from('tours')
    .select('id, name, start_date, artist:artists(name)')
    .eq('workspace_id', profile.workspace_id)
    .order('start_date', { ascending: false });
  if (artistId) toursQuery = toursQuery.eq('artist_id', artistId);
  const { data: tours, error: toursError } = await toursQuery;

  if (toursError || !tours?.length) {
    return NextResponse.json({
      tours: [],
      needsAttention: [],
      upcoming: [],
    });
  }

  const tourIds = tours.map((t) => t.id);

  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, tour_id, date, day_type, venue_name, city')
    .in('tour_id', tourIds)
    .in('day_type', SHOW_DAY_TYPES)
    .order('date');

  const routingIds = (routingRows ?? []).map((r) => r.id);
  const routingByTour = new Map<string, typeof routingRows>();
  (routingRows ?? []).forEach((r) => {
    const list = routingByTour.get(r.tour_id) ?? [];
    list.push(r);
    routingByTour.set(r.tour_id, list);
  });

  let instances: { id: string; routing_id: string; status: string; flags: unknown; section_statuses: Record<string, { status: string }> | null; form_config_id: string | null }[] = [];
  if (routingIds.length > 0) {
    const { data: inst } = await supabase
      .from('advance_instances')
      .select('id, routing_id, status, flags, section_statuses, form_config_id')
      .in('routing_id', routingIds);
    instances = (inst ?? []) as typeof instances;
  }

  const configIds = [...new Set(instances.map((i) => i.form_config_id).filter(Boolean))] as string[];
  const configSectionsCount = new Map<string, number>();
  if (configIds.length > 0) {
    const { data: configs } = await supabase
      .from('advance_form_configs')
      .select('id, sections')
      .in('id', configIds);
    for (const c of configs ?? []) {
      const sections = (c.sections as unknown[]) ?? [];
      configSectionsCount.set(c.id, sections.length);
    }
  }

  const instanceByRoutingId = new Map(instances.map((i) => [i.routing_id, i]));
  const routingById = new Map((routingRows ?? []).map((r) => [r.id, r]));

  const now = new Date();
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);

  const tourStats: { tour_id: string; tour_name: string; artist_name: string; advance_count: number; total_shows: number; percent: number }[] = [];
  const needsAttention: { tour_id: string; tour_name: string; artist_name: string; routing_id: string; date: string; venue_name: string | null; city: string; reason: string }[] = [];
  const upcoming: { tour_id: string; tour_name: string; artist_name: string; routing_id: string; date: string; venue_name: string | null; city: string; status: string }[] = [];

  for (const tour of tours) {
    const artistName = (tour.artist as { name?: string } | null)?.name ?? '—';
    const rows = routingByTour.get(tour.id) ?? [];
    const totalShows = rows.length;
    let completeCount = 0;
    const showCompletionPcts: number[] = [];
    for (const row of rows) {
      const inst = instanceByRoutingId.get(row.id);
      const sectionStatuses = (inst?.section_statuses ?? {}) as Record<string, { status: string }>;
      const totalSections = inst?.form_config_id ? (configSectionsCount.get(inst.form_config_id) ?? 0) : 0;
      const sectionComplete = Object.values(sectionStatuses).filter((s) => s?.status === 'complete').length;
      const showPct = totalSections > 0 ? (sectionComplete / totalSections) * 100 : 0;
      showCompletionPcts.push(showPct);
      if (inst?.status === 'complete') completeCount++;
      const date = new Date(row.date);
      const hasUnresolvedFlags = Array.isArray(inst?.flags) && (inst.flags as FlagItem[]).some((f) => !f.resolved);
      if (hasUnresolvedFlags) {
        const firstFlag = (inst!.flags as FlagItem[]).find((f) => !f.resolved);
        needsAttention.push({
          tour_id: tour.id,
          tour_name: tour.name,
          artist_name: artistName,
          routing_id: row.id,
          date: row.date,
          venue_name: row.venue_name ?? null,
          city: row.city ?? '',
          reason: firstFlag?.type ?? 'flag',
        });
      }
      if (date >= now && date <= in14 && inst?.status !== 'complete') {
        upcoming.push({
          tour_id: tour.id,
          tour_name: tour.name,
          artist_name: artistName,
          routing_id: row.id,
          date: row.date,
          venue_name: row.venue_name ?? null,
          city: row.city ?? '',
          status: inst?.status ?? 'not_started',
        });
      }
    }
    const percent = showCompletionPcts.length > 0
      ? Math.round(showCompletionPcts.reduce((a, b) => a + b, 0) / showCompletionPcts.length)
      : 0;
    tourStats.push({
      tour_id: tour.id,
      tour_name: tour.name,
      artist_name: artistName,
      advance_count: completeCount,
      total_shows: totalShows,
      percent,
    });
  }

  upcoming.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({
    tours: tourStats,
    needsAttention,
    upcoming,
  });
}
