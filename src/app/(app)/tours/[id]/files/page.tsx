import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { buildTourScopedFileVms } from '@/lib/tour-files/buildTourFileVms';
import { TourFilesClient } from '@/components/tours/TourFilesClient';

export const dynamic = 'force-dynamic';

export default async function TourFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: tourId } = await params;
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
      <TourFilesClient initial={files} />
    </div>
  );
}
