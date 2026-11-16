/* /crew/[tourId]/file/[fileId] — open a tour file from the crew view.
   Reads the file row and signs its storage path with the SIGNED-IN client,
   so the database's Files access (293 rules on file_references AND on the
   tour-files bucket) decides; nothing here uses the service role. */
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ tourId: string; fileId: string }> }) {
  const { tourId, fileId } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL(`/login?next=/crew/${tourId}`, _req.url));
  const { data: file } = await supabase
    .from('file_references')
    .select('storage_provider, provider_file_id, linked_to_type, linked_to_id')
    .eq('id', fileId)
    .maybeSingle();
  const f = file as { storage_provider: string | null; provider_file_id: string | null; linked_to_type: string; linked_to_id: string } | null;
  if (!f || f.linked_to_type !== 'tour' || f.linked_to_id !== tourId || !f.storage_provider || !f.provider_file_id) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
  const { data: signed } = await supabase.storage.from(f.storage_provider).createSignedUrl(f.provider_file_id, 300);
  if (!signed?.signedUrl) return NextResponse.json({ error: 'File not available' }, { status: 404 });
  return NextResponse.redirect(signed.signedUrl);
}
