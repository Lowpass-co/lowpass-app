/* ============================================
   LOWPASS — /artists/[id]/riders (Sprint 12 §7)

   Artist-level rider templates. Lists rider_packs at
   scope='artist' AND kind='rider' under this artist, with
   per-row "Assigned to N tours" counts derived via the
   rider_folders inheritance chain.

   Click a row → /rider-packs/[id] (existing editor).
   Click "+ New rider" → POST /api/rider-packs → redirect to
                         the editor for the fresh pack.
   Click "Assign to tour…" → opens the picker dialog → POST
                         /api/rider-packs/[id]/assign-to-tour.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  ArtistTemplateList,
  type ArtistTemplateRow,
  type ArtistTourOption,
} from '@/components/artists/library/ArtistTemplateList';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PackRow {
  id: string;
  title: string | null;
  updated_at: string;
  folder_id: string | null;
}

interface ChildFolderRow {
  id: string;
  inherit_from_folder_id: string;
  scope: string;
}

export default async function ArtistRidersPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  /* Artist look-up — also confirms RLS / workspace scoping. */
  const { data: artistData } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .maybeSingle();
  const artist = artistData as { id: string; name: string } | null;
  if (!artist) notFound();

  /* Fetch all artist-scope rider templates for this artist. */
  const { data: packData } = await supabase
    .from('rider_packs')
    .select('id, title, updated_at, folder_id')
    .eq('artist_id', artistId)
    .eq('scope', 'artist')
    .eq('kind', 'rider')
    .order('updated_at', { ascending: false });
  const packs = (packData ?? []) as PackRow[];

  /* Derive "Assigned to N tours" — count distinct tour_ids
     among tour-scope folders that inherit from each template's
     folder. Single query, group in JS. */
  const folderIds = packs
    .map((p) => p.folder_id)
    .filter((v): v is string => !!v);
  let assignedCountByFolder: Map<string, number> = new Map();
  if (folderIds.length > 0) {
    const { data: childRows } = await supabase
      .from('rider_folders')
      .select('id, inherit_from_folder_id, scope')
      .in('inherit_from_folder_id', folderIds)
      .eq('scope', 'tour');
    const children = (childRows ?? []) as ChildFolderRow[];
    assignedCountByFolder = children.reduce((acc, c) => {
      acc.set(c.inherit_from_folder_id, (acc.get(c.inherit_from_folder_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const rows: ArtistTemplateRow[] = packs.map((p) => ({
    id: p.id,
    title: p.title,
    updated_at: p.updated_at,
    assigned_count: p.folder_id ? assignedCountByFolder.get(p.folder_id) ?? 0 : 0,
  }));

  /* Tour options for the AssignToTourDialog. */
  const { data: tourData } = await supabase
    .from('tours')
    .select('id, name')
    .eq('artist_id', artistId)
    .order('start_date', { ascending: false });
  const tours = (tourData ?? []) as ArtistTourOption[];

  return (
    <ArtistTemplateList
      artistId={artistId}
      artistName={artist.name}
      kind="rider"
      label="rider"
      rows={rows}
      tours={tours}
      empty="No rider templates yet. Create your first one — it'll be assignable to every tour for this artist."
    />
  );
}
