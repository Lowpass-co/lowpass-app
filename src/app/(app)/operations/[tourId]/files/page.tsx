/* ============================================
   LOWPASS — Operations · Files (Phase 4 unblock · Files v2 canvas)

   /operations/[tourId]/files — live per-tour document store. Ports
   /tours/[id]/files, inner content only (ProductShell + TourHeader come
   from /operations/[tourId]/layout.tsx). Mounts <FilesCanvas>, the
   Drive-style folder canvas (folder tiles + file cards, breadcrumb,
   drag-to-move) that replaced the flat <TourFilesClient> DataTable.
   Folders live at metadata.folder on file_references — no migration.
   ============================================ */

import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { buildTourScopedFileVms } from '@/lib/tour-files/buildTourFileVms';
import { FilesCanvas } from '@/components/files/FilesCanvas';

export const dynamic = 'force-dynamic';

export default async function OperationsTourFilesPage({ params }: { params: Promise<{ tourId: string }> }) {
  const { tourId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const { data: profile } = await supabase.from('profiles').select('workspace_id').eq('id', user.id).maybeSingle();
  if (!profile?.workspace_id) notFound();

  const { data: tour, error: tourErr } = await supabase
    .from('tours')
    .select('id, name')
    .eq('id', tourId)
    .eq('workspace_id', profile.workspace_id)
    .maybeSingle();

  if (tourErr || !tour) notFound();

  const files = await buildTourScopedFileVms(supabase, { tourId: tour.id, workspaceId: profile.workspace_id });

  return (
    <div className="mx-auto w-full px-4 pt-6">
      <FilesCanvas
        initial={files}
        uploadScope={{ type: 'tour', id: tour.id }}
        subtitle="Consolidated uploads for this tour. Drag files here or use Upload; organise them into folders."
      />
    </div>
  );
}
