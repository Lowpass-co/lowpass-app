/* ============================================
   LOWPASS — /artists/[id]/channel-lists (Sprint 12 §7)

   Artist-level channel-list templates. Same shape as the
   /riders page but filters on kind='channel_list'.
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

export default async function ArtistChannelListsPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  const { data: artistData } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .maybeSingle();
  const artist = artistData as { id: string; name: string } | null;
  if (!artist) notFound();

  const { data: packData } = await supabase
    .from('rider_packs')
    .select('id, title, updated_at, folder_id')
    .eq('artist_id', artistId)
    .eq('scope', 'artist')
    .eq('kind', 'channel_list')
    .order('updated_at', { ascending: false });
  const packs = (packData ?? []) as PackRow[];

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
      kind="channel_list"
      label="channel list"
      rows={rows}
      tours={tours}
      empty="No channel-list templates yet. Create your first one — it'll be assignable to every tour for this artist."
    />
  );
}
