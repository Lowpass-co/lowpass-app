/* ============================================
   LOWPASS — /artists/[id]/riders — the artist's riders (rebuild, Nov 2026)

   A rider belongs to a TOUR now (Tech + Hospitality, written and published
   on Production › Riders, migration 301). This library page is where the
   artist's riders are found: each tour's two documents with their latest
   version, and the workspace's rider templates (the artist's own first) —
   rename / delete here; they're made from a tour's rider (⋯ › Save as
   template) and used by "Start from…" on any tour. Old builder riders are
   brought over from here too. Opening the page writes nothing.
   ============================================ */

import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getViewerAccess } from '@/lib/permissions/tourAccess';
import { legacyCount } from '@/server/riders/legacy';
import { RIDER_DEFAULT_TITLE, type RiderKind } from '@/lib/riders/types';
import { ArtistRidersLibrary, type LibraryTour, type LibraryTemplate } from '@/components/riders/ArtistRidersLibrary';

export const dynamic = 'force-dynamic';

export default async function ArtistRidersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: artistId } = await params;
  const supabase = (await createServerSupabaseClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: artistRow } = await supabase.from('artists').select('id, name, workspace_id').eq('id', artistId).maybeSingle();
  const artist = artistRow as { id: string; name: string; workspace_id: string } | null;
  if (!artist) notFound();
  const [toursRes, templatesRes, access] = await Promise.all([
    supabase.from('tours').select('id, name, start_date, end_date').eq('artist_id', artistId).order('start_date', { ascending: false, nullsFirst: false }),
    supabase.from('rider_templates').select('id, name, kind, artist_id, updated_at').eq('workspace_id', artist.workspace_id).order('name', { ascending: true }),
    getViewerAccess(supabase, user.id, null),
  ]);
  const tours = (toursRes.data ?? []) as { id: string; name: string | null; start_date: string | null; end_date: string | null }[];
  const ids = tours.map((t) => t.id);

  const [ridersRes, versionsRes] = ids.length
    ? await Promise.all([
        supabase.from('riders').select('tour_id, kind, title').in('tour_id', ids),
        supabase.from('rider_versions').select('tour_id, major, minor, published_at').in('tour_id', ids).order('major', { ascending: false }).order('minor', { ascending: false }).limit(1000),
      ])
    : [{ data: [] }, { data: [] }];
  const latest = new Map<string, { label: string; publishedAt: string }>();
  for (const v of (versionsRes.data ?? []) as { tour_id: string; major: number; minor: number; published_at: string }[]) {
    if (!latest.has(v.tour_id)) latest.set(v.tour_id, { label: `${v.major}.${v.minor}`, publishedAt: v.published_at });
  }
  const docsByTour = new Map<string, { kind: RiderKind; title: string }[]>();
  for (const r of (ridersRes.data ?? []) as { tour_id: string; kind: RiderKind; title: string | null }[]) {
    const list = docsByTour.get(r.tour_id) ?? [];
    list.push({ kind: r.kind, title: r.title?.trim() || RIDER_DEFAULT_TITLE[r.kind] });
    docsByTour.set(r.tour_id, list);
  }
  const rows: LibraryTour[] = tours.map((t) => ({
    id: t.id,
    name: t.name?.trim() || 'Untitled tour',
    start: t.start_date,
    end: t.end_date,
    docs: (docsByTour.get(t.id) ?? []).sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'tech' ? -1 : 1)),
    latest: latest.get(t.id) ?? null,
  }));
  const templates: LibraryTemplate[] = ((templatesRes.data ?? []) as { id: string; name: string; kind: RiderKind; artist_id: string | null; updated_at: string }[])
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind, mine: t.artist_id === artistId, updatedAt: t.updated_at }))
    .sort((a, b) => Number(b.mine) - Number(a.mine));
  const manager = !!access?.manager;

  return (
    <ArtistRidersLibrary
      artistName={artist.name}
      tours={rows}
      templates={templates}
      canEditTemplates={!!access?.library}
      legacyCount={manager ? await legacyCount(supabase, artist.workspace_id) : 0}
    />
  );
}
