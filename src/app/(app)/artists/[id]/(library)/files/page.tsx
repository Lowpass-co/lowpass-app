/* ============================================
   LOWPASS — /artists/[id]/files (G1-A #2)

   A real artist-files surface (was a dead placeholder stub, graded fail). Lists
   the artist's uploaded files (file_references linked_to_type='artist') in the
   shared <TourFilesClient> DataTable with Upload + drag-drop + an invitation
   empty state. Uploads write to the `tour-files` bucket via /api/files
   (migration 241 creates the bucket + RLS).
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { TourFilesClient } from '@/components/tours/TourFilesClient';
import { buildArtistScopedFileVms } from '@/lib/tour-files/buildArtistFileVms';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ArtistFilesPage({ params }: PageProps) {
  const { id: artistId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  const workspaceId = (profile as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) notFound();

  const { data: artistData } = await supabase
    .from('artists')
    .select('id, name')
    .eq('id', artistId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const artist = artistData as { id: string; name: string } | null;
  if (!artist) notFound();

  const files = await buildArtistScopedFileVms(supabase, { artistId: artist.id, workspaceId });

  return (
    <div className="mx-auto w-full px-4 pt-6">
      <TourFilesClient
        initial={files}
        uploadScope={{ type: 'artist', id: artist.id }}
        title={`${artist.name} — Files`}
        subtitle="Artist-level documents. Drag files here or use Upload."
      />
    </div>
  );
}
