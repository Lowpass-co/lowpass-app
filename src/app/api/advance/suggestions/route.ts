/* ============================================
   LOWPASS — Advance Suggestions API

   GET: Unfilled advance items with importance >= 50 for shows in next 30 days.
   Sorted by days until show ASC, importance DESC.
   ============================================ */

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { parseWorkspaceArtistId } from '@/lib/artist-scope';

const SHOW_DAY_TYPES = ['show', 'festival'];

const IMPORTANCE_BY_FIELD: Record<string, number> = {
  venue_confirmed: 95,
  load_in_time: 90,
  catering_headcount: 85,
  hotel_confirmation: 80,
  transport_booked: 80,
  production_contact: 75,
  venue_name: 90,
  load_in: 90,
  soundcheck: 85,
  catering: 85,
  accommodation: 80,
  transport: 80,
  parking_map: 40,
  parking_location: 45,
  dressing_room_furnishings: 10,
  rider_status: 85,
  rider_type: 80,
};
const DEFAULT_IMPORTANCE = 50;
const MIN_IMPORTANCE = 50;
const MAX_ITEMS = 40;

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
    return NextResponse.json({ suggestions: [] });
  }

  const now = new Date();
  const in30 = new Date(now);
  in30.setDate(in30.getDate() + 30);

  let toursQuery = supabase
    .from('tours')
    .select('id, name, artist:artists(name)')
    .eq('workspace_id', profile.workspace_id);
  if (artistId) toursQuery = toursQuery.eq('artist_id', artistId);
  const { data: tours } = await toursQuery;

  if (!tours?.length) {
    return NextResponse.json({ suggestions: [] });
  }

  const tourIds = tours.map((t) => t.id);
  const { data: routingRows } = await supabase
    .from('routing')
    .select('id, tour_id, date, venue_name, city')
    .in('tour_id', tourIds)
    .in('day_type', SHOW_DAY_TYPES)
    .gte('date', now.toISOString().slice(0, 10))
    .lte('date', in30.toISOString().slice(0, 10))
    .order('date');

  if (!routingRows?.length) {
    return NextResponse.json({ suggestions: [] });
  }

  const routingIds = routingRows.map((r) => r.id);
  const routingById = new Map(routingRows.map((r) => [r.id, r]));

  const { data: instances } = await supabase
    .from('advance_instances')
    .select('id, routing_id, data, form_config_id')
    .in('routing_id', routingIds);

  if (!instances?.length) {
    return NextResponse.json({ suggestions: [] });
  }

  const configIds = [...new Set(instances.map((i) => i.form_config_id).filter(Boolean))] as string[];
  const { data: configs } = await supabase
    .from('advance_form_configs')
    .select('id, sections')
    .in('id', configIds);

  const configById = new Map((configs ?? []).map((c) => [c.id, c]));
  type Section = { template_id: string; label: string; fields: { id: string; label: string }[] };
  type Suggestion = {
    tour_id: string;
    tour_name: string;
    routing_id: string;
    date: string;
    venue_name: string | null;
    city: string;
    section_id: string;
    section_label: string;
    field_id: string;
    field_label: string;
    importance: number;
    importance_badge: 'High' | 'Medium';
  };

  const suggestions: Suggestion[] = [];
  const tourById = new Map(tours.map((t) => [t.id, t]));

  for (const inst of instances) {
    const routing = routingById.get(inst.routing_id);
    if (!routing) continue;
    const tour = tourById.get(routing.tour_id);
    if (!tour) continue;
    const config = inst.form_config_id ? configById.get(inst.form_config_id) : null;
    const sections = (config?.sections ?? []) as Section[];
    const data = (inst.data ?? {}) as Record<string, Record<string, unknown>>;

    for (const section of sections) {
      const sectionData = data[section.template_id];
      for (const field of section.fields ?? []) {
        const value = sectionData?.[field.id];
        const isEmpty = value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
        if (!isEmpty) continue;
        const importance = IMPORTANCE_BY_FIELD[field.id] ?? IMPORTANCE_BY_FIELD[field.id.toLowerCase()] ?? DEFAULT_IMPORTANCE;
        if (importance < MIN_IMPORTANCE) continue;
        suggestions.push({
          tour_id: routing.tour_id,
          tour_name: tour.name,
          routing_id: inst.routing_id,
          date: routing.date,
          venue_name: routing.venue_name ?? null,
          city: routing.city ?? '',
          section_id: section.template_id,
          section_label: section.label ?? 'Section',
          field_id: field.id,
          field_label: (field as { label?: string }).label ?? field.id,
          importance,
          importance_badge: importance >= 80 ? 'High' : 'Medium',
        });
      }
    }
  }

  const dateStr = (d: string) => d.slice(0, 10);
  suggestions.sort((a, b) => {
    const dayDiffA = (new Date(dateStr(a.date)).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const dayDiffB = (new Date(dateStr(b.date)).getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (dayDiffA !== dayDiffB) return dayDiffA - dayDiffB;
    return b.importance - a.importance;
  });

  return NextResponse.json({
    suggestions: suggestions.slice(0, MAX_ITEMS),
  });
}
